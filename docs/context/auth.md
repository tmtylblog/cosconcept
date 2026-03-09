# 4. Auth & Organizations

> Last updated: 2026-03-09

## Library

**Better Auth** (npm `better-auth`) with Drizzle adapter on Neon PostgreSQL.

- Server config: `src/lib/auth.ts` — exports `auth` (the Better Auth instance)
- Client config: `src/lib/auth-client.ts` — exports `authClient`, `signIn`, `signUp`, `signOut`, `useSession`, `useActiveOrganization`
- Catch-all route: `src/app/api/auth/[...all]/route.ts` — `force-dynamic`, wraps `toNextJsHandler(auth)` with error logging

## Plugins

| Plugin | Purpose |
|--------|---------|
| `organization` | Multi-tenant orgs with membership limits, auto-creates free subscription on org creation |
| `admin` | Platform-level roles (user/admin/superadmin), ban/impersonate capabilities |

Client-side equivalents: `organizationClient()`, `adminClient()` — both imported in `auth-client.ts`.

## Auth Methods

### Email + Password
- Enabled: `emailAndPassword.enabled: true`
- Min password length: 8
- Login page enforces **corporate email only** — personal providers (Gmail, Yahoo, Outlook, etc.) are blocked via `src/lib/email-validation.ts` (`isPersonalEmail()`)
- Password reset: `POST /api/auth/request-password-reset`

### OAuth — Google
- Provider: `google` (Google Workspace / corporate accounts encouraged)
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Callback URL: `/dashboard`
- Client usage: `signIn.social({ provider: "google", callbackURL: "/dashboard" })`

## Role System

### Platform roles (users.role)
Stored on the `users` table as a text field. Three values:

| Role | Description | Access |
|------|-------------|--------|
| `user` | Default for all new accounts | App features only |
| `admin` | Platform admin | Can manage users (create, list, set-role, ban, get, update) and sessions (list, revoke) |
| `superadmin` | Full platform control | All admin permissions + impersonate, delete users, delete sessions, set passwords |

Configured via Better Auth `admin` plugin with `createAccessControl`. Default role on signup: `"user"`.

### Organization roles (members.role)
Stored on the `members` table as a `member_role` enum:

| Role | Description |
|------|-------------|
| `owner` | Org creator, full control |
| `admin` | Org-level admin |
| `member` | Standard member |

## Organization Model

### Lifecycle
1. User signs up or signs in
2. Redirected to `/org/select` (org select page)
3. Org select logic (`src/app/(auth)/org/select/page.tsx`):
   - **0 orgs**: Auto-create org from email domain (e.g., `chameleon.co` becomes org "Chameleon" with slug `chameleon-co`), auto-select it, redirect to `/dashboard`
   - **1 org**: Auto-select, redirect to `/dashboard`
   - **2+ orgs**: Show picker (rare case)
4. On org creation, `afterCreate` hook auto-calls `createFreeSubscription(orgId)` — inserts a row into `subscriptions` with `plan: "free"`, `status: "active"`, and a placeholder Stripe customer ID

### Limits
- **Max orgs per user**: 3 (`organizationLimit: 3`)
- **Member limit per org**: Dynamic, based on subscription plan via `membershipLimit` callback:
  - Free: 1 seat
  - Pro: 3 seats
  - Enterprise: unlimited

### Active org
Client-side: `useActiveOrganization()` from `auth-client.ts`. Set via `authClient.organization.setActive({ organizationId })`.

## Session Management

### Cookie
- Cookie name: `better-auth.session_token` (or `__Secure-better-auth.session_token` on HTTPS)
- Sessions table tracks: `token`, `expiresAt`, `ipAddress`, `userAgent`, `impersonatedBy`

### Server-side session check (API routes + layouts)
```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
// session.user — { id, name, email, role, banned, ... }
// session.session — { id, token, expiresAt, ... }
```

This is the canonical pattern used across all API routes and server components. No internal HTTP fetch — uses Better Auth's direct API.

### Client-side session check
```ts
import { useSession } from "@/lib/auth-client";

const { data: session } = useSession();
const isGuest = !session?.user;
```

## Middleware

**File:** `src/middleware.ts`

Strategy: **progressive auth gate** — most routes are public. Only specific API paths require auth.

### Protected paths (require session cookie)
- `/api/chat` (except `/api/chat/guest` and `/api/chat/migrate`)
- `/api/stripe`
- `/api/admin` (except `/api/admin/neo4j/seed`, `/api/admin/neo4j/migrate`, `/api/admin/import` — these use `ADMIN_SECRET` header instead)

### How it works
1. Checks if path matches `PROTECTED_API_PATHS` (after excluding `PUBLIC_EXCEPTIONS`)
2. If protected, checks for session cookie existence only (no API call)
3. Returns `401 { error: "Authentication required" }` if no cookie
4. Full session validation happens server-side in the route handler via `auth.api.getSession()`

### Matcher
Excludes static assets: `_next/static`, `_next/image`, `favicon.ico`, `sitemap.xml`, `robots.txt`, image files.

## Auth Pages

All under `src/app/(auth)/` route group:

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `login/page.tsx` | Full login/signup page with Google OAuth + email/password, forgot password flow |
| `/org/select` | `org/select/page.tsx` | Org picker — auto-creates/selects in most cases |
| `/banned` | `banned/page.tsx` | Shown to banned users — contact support message + sign out button |

Additionally, `src/components/login-panel.tsx` is a modal version of login used within the app layout (for guest-to-authenticated upgrade without leaving the page).

## Route Protection Patterns

### Admin layout (superadmin only)
`src/app/(admin)/layout.tsx` — server-side check:
```ts
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) redirect("/login");
if (session.user.role !== "superadmin") redirect("/dashboard");
```

### Admin API routes (superadmin only)
Standard pattern across all `/api/admin/*` routes:
```ts
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user || session.user.role !== "superadmin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Some admin endpoints accept both roles:
```ts
if (!["admin", "superadmin"].includes(session.user.role ?? "")) { ... }
```

### Authenticated API routes (any logged-in user)
```ts
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const userId = session.user.id;
```

### App layout (client-side, graceful)
`src/app/(app)/layout.tsx` — uses `useSession()` to determine `isGuest`. Guests see a centered chat panel; authenticated users get full nav + sidebar chat. No hard redirect.

## Auth Tables

All defined in `src/lib/db/schema.ts`.

### users
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text | Required |
| email | text | Unique |
| emailVerified | boolean | Default false |
| image | text | Nullable |
| role | text | `"user"` / `"admin"` / `"superadmin"` — default `"user"` |
| banned | boolean | Default false |
| banReason | text | Nullable |
| banExpires | timestamp | Nullable |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| userId | text FK → users | Cascade delete |
| token | text | Unique |
| expiresAt | timestamp | |
| ipAddress | text | |
| userAgent | text | |
| impersonatedBy | text | Admin plugin: tracks who is impersonating |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### accounts
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| userId | text FK → users | Cascade delete |
| accountId | text | Provider's user ID |
| providerId | text | `"credential"` or `"google"` |
| accessToken | text | OAuth token |
| refreshToken | text | OAuth refresh |
| accessTokenExpiresAt | timestamp | |
| refreshTokenExpiresAt | timestamp | |
| scope | text | |
| idToken | text | |
| password | text | Hashed password (for credential accounts) |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### verifications
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| identifier | text | Email or other identifier |
| value | text | Token/code |
| expiresAt | timestamp | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### organizations
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text | |
| slug | text | Unique |
| logo | text | Nullable |
| metadata | text | Nullable |
| createdAt | timestamp | |

### members
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| userId | text FK → users | Cascade delete |
| organizationId | text FK → organizations | Cascade delete |
| role | member_role enum | `"owner"` / `"admin"` / `"member"` — default `"member"` |
| createdAt | timestamp | |

### invitations
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| email | text | |
| organizationId | text FK → organizations | Cascade delete |
| role | member_role enum | Default `"member"` |
| inviterId | text FK → users | Cascade delete |
| status | text | Default `"pending"` |
| expiresAt | timestamp | |
| createdAt | timestamp | |

## Table Relationships

```
users ─┬─< sessions (userId)
       ├─< accounts (userId)
       ├─< members (userId) >── organizations
       └─< invitations (inviterId)

organizations ─┬─< members (organizationId)
               ├─< invitations (organizationId)
               ├── subscriptions (organizationId, 1:1)
               └─< serviceFirms (organizationId)
```

## Env Vars

| Variable | Purpose |
|----------|---------|
| `BETTER_AUTH_URL` | Base URL for auth (used as `baseURL` and `trustedOrigins`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## Quick Reference

**Check auth in a server component or API route:**
```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
```

**Check auth on the client:**
```ts
import { useSession, useActiveOrganization } from "@/lib/auth-client";

const { data: session } = useSession();
const { data: activeOrg } = useActiveOrganization();
```

**Sign in programmatically:**
```ts
import { signIn } from "@/lib/auth-client";

// Email
await signIn.email({ email, password });

// Google
await signIn.social({ provider: "google", callbackURL: "/dashboard" });
```

**Sign out:**
```ts
import { signOut } from "@/lib/auth-client";

await signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } });
```

**Org operations:**
```ts
import { authClient } from "@/lib/auth-client";

await authClient.organization.list();
await authClient.organization.create({ name, slug });
await authClient.organization.setActive({ organizationId });
```
