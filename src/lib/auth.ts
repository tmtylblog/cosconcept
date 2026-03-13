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
import { sendEmail } from "./email/email-client";

// Resolve the canonical base URL for Better Auth.
// On Vercel, VERCEL_PROJECT_PRODUCTION_URL is the stable production domain
// (e.g. "cos-concept.vercel.app"). BETTER_AUTH_URL is the user-configured
// override (e.g. custom domain). Fallback chain ensures OAuth callbacks
// always point to the right host — never localhost in production.
function resolveBaseURL(): string {
  if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost")) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

const AUTH_BASE_URL = resolveBaseURL();

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

  baseURL: AUTH_BASE_URL,

  trustedOrigins: [
    AUTH_BASE_URL,
    // Also trust the explicit env var if it differs from resolved URL
    ...(process.env.BETTER_AUTH_URL && process.env.BETTER_AUTH_URL !== AUTH_BASE_URL
      ? [process.env.BETTER_AUTH_URL] : []),
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
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Collective OS password",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px; }
    .logo { color: #6366f1; font-size: 20px; font-weight: 700; }
    .cta { background: #6366f1; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-top: 16px; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><span class="logo">Collective OS</span></div>
    <p>Hi ${user.name || "there"},</p>
    <p>We received a request to reset your password. Click the button below to set a new one:</p>
    <a href="${url}" class="cta">Reset Password</a>
    <p style="margin-top:16px;font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>
    <div class="footer">Collective OS &mdash; joincollectiveos.com</div>
  </div>
</body>
</html>`,
        text: `Hi ${user.name || "there"}, reset your password here: ${url}`,
      });
    },
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
      adminRoles: ["admin", "superadmin", "growth_ops", "customer_success"],
      roles: {
        admin: ac.newRole({
          user: ["create", "list", "set-role", "ban", "get", "update"],
          session: ["list", "revoke"],
        }),
        superadmin: ac.newRole({
          user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
          session: ["list", "revoke", "delete"],
        }),
        growth_ops: ac.newRole({
          user: ["list", "get"],
          session: ["list"],
        }),
        customer_success: ac.newRole({
          user: ["list", "get"],
          session: ["list"],
        }),
      },
    }),
  ],
});
