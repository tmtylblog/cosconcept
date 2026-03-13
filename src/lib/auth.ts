import { betterAuth } from "better-auth";
import { organization, admin, createAccessControl } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";
import { PLAN_LIMITS } from "./billing/plan-limits";
import { createFreeSubscription } from "./billing/create-free-subscription";
import { enqueue } from "./jobs/queue";
import { isPersonalEmail, CORPORATE_EMAIL_ERROR } from "./email-validation";

// Define access control with admin-level statements
const ac = createAccessControl({
  user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
    },
  }),

  baseURL: process.env.BETTER_AUTH_URL,

  trustedOrigins: [
    process.env.BETTER_AUTH_URL!,
    // Allow Vercel preview/deployment URLs alongside custom domain
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
  ],

  // Rate limiting disabled — Better Auth's built-in rate limiter corrupts JSON
  // storage on Vercel serverless (SyntaxError in safeJSONParse). Use Upstash
  // Redis for rate limiting when needed (Phase 4+).
  rateLimit: {
    enabled: false,
  },

  /**
   * Declare all custom user columns so Better Auth includes them in
   * getSession() return types. Admin plugin fields (role, banned, etc.)
   * are defined in the plugin schema but not always inferred by TS.
   */
  user: {
    additionalFields: {
      role: { type: "string", input: false },
      banned: { type: "boolean", input: false },
      banReason: { type: "string", input: false },
      banExpires: { type: "date", input: false },
      jobTitle: { type: "string" },
      phone: { type: "string" },
      linkedinUrl: { type: "string" },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // Block personal email registrations (server-side enforcement)
  // + Auto-assign superadmin role to @joincollectiveos.com team members
  databaseHooks: {
    user: {
      create: {
        before: async (user, _ctx) => {
          if (user.email && isPersonalEmail(user.email)) {
            throw new Error(CORPORATE_EMAIL_ERROR);
          }
          return user;
        },
        after: async (user) => {
          if (user.email?.endsWith("@joincollectiveos.com")) {
            await db
              .update(schema.users)
              .set({ role: "superadmin" })
              .where(eq(schema.users.id, user.id));
          }

          // Enqueue attribution check — runs async, non-blocking
          const nameParts = (user.name ?? "").split(" ");
          await enqueue("attribution-check", {
            userId: user.id,
            email: user.email ?? "",
            firstName: nameParts[0] ?? null,
            lastName: nameParts.slice(1).join(" ") || null,
            linkedinUrl: null,
          }).catch(() => {
            // Non-fatal — attribution failure must never block signup
          });
        },
      },
    },
  },

  plugins: [
    organization({
      async membershipLimit(data) {
        // data may be the org object or a string depending on Better Auth version
        const orgId =
          typeof data === "string" ? data : (data as { id: string }).id;
        const rows = await db
          .select({ plan: schema.subscriptions.plan })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.organizationId, orgId))
          .limit(1);
        const plan = rows[0]?.plan ?? "free";
        return PLAN_LIMITS[plan].members;
      },
      organizationLimit: 3, // max orgs per user
      async afterCreate(org: { id: string } | string) {
        // Auto-create a free subscription for every new org
        const orgId =
          typeof org === "string" ? org : (org as { id: string }).id;
        await createFreeSubscription(orgId);
      },
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin", "superadmin"],
      roles: {
        admin: ac.newRole({
          user: ["create", "list", "set-role", "ban", "get", "update"],
          session: ["list", "revoke"],
        }),
        superadmin: ac.newRole({
          user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
          session: ["list", "revoke", "delete"],
        }),
      },
    }),
  ],
});
