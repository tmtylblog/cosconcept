# Scan My Network — DevOps Setup Checklist

Feature is built and deployed. Waiting on credentials before OAuth flows work.

---

## Google (Gmail)

No new app needed — add a redirect URI to the existing OAuth client.

1. Go to [Google Cloud Console](https://console.cloud.google.com) → your project → **APIs & Services → Credentials**
2. Click the existing OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, add:
   - `https://cos-concept.vercel.app/api/settings/network/callback/google`
   - `http://localhost:3000/api/settings/network/callback/google`
4. Save — no new credentials needed
5. Ensure **Gmail API** is enabled: APIs & Services → Library → Gmail API → Enable

Reuses existing `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars (already set).

---

## Microsoft (Outlook / Microsoft 365)

New Azure AD app registration required.

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations → **New registration**
   - Name: `COS Network Scanner`
   - Supported account types: **"Accounts in any organizational directory and personal Microsoft accounts"**
   - Redirect URI: Web → `https://cos-concept.vercel.app/api/settings/network/callback/microsoft`
   - Also add: `http://localhost:3000/api/settings/network/callback/microsoft`
2. After creating → **Certificates & secrets → New client secret** → copy value immediately (only shown once)
3. **API permissions → Add → Microsoft Graph → Delegated:**
   - `Mail.ReadBasic`
   - `offline_access` (included by default)
   - Click "Grant admin consent"
4. Note down: **Application (client) ID** and the **client secret value**

---

## Env Vars to Add

Add to `.env.local` AND Vercel dashboard (Settings → Environment Variables):

```
MICROSOFT_CLIENT_ID=<Application (client) ID from Azure>
MICROSOFT_CLIENT_SECRET=<Client secret value from Azure>
NETWORK_SCAN_STATE_SECRET=<run: openssl rand -hex 16>
```

Redeploy after adding to Vercel.

---

## What's Already Built

| File | Purpose |
|------|---------|
| `src/app/(app)/settings/network/page.tsx` | UI — connect cards, scan button, results list |
| `src/app/api/settings/network/connect/[provider]/route.ts` | OAuth initiation |
| `src/app/api/settings/network/callback/[provider]/route.ts` | OAuth token exchange |
| `src/app/api/settings/network/status/route.ts` | Connection status + results |
| `src/app/api/settings/network/scan/route.ts` | Trigger scan job |
| `src/app/api/settings/network/disconnect/route.ts` | Remove connection + data |
| `src/lib/enrichment/network-scanner.ts` | Gmail + Microsoft Graph header scanning + scoring |
| `src/lib/jobs/handlers/network-scan.ts` | Background job handler |
| DB tables | `network_connections`, `network_relationships` (already created in Neon) |

---

## Google OAuth Verification (future)

Once you have real users (>100), Google will require app verification for the `gmail.metadata` scope:
- Record a short Loom showing the OAuth flow and how headers are used
- Submit privacy policy URL
- Fill in verification form in Google Cloud Console
- Timeline: 3–8 weeks
- Cost: free (but need a security assessment ~$2–5K for restricted scope at scale)

Not needed during testing / early users.
