/**
 * Email Client
 *
 * Wraps the email sending provider (Resend).
 * All outbound emails from ossy@joincollectiveos.com route through here.
 *
 * DEV SAFEGUARD (env-level, always applied first):
 *   Set RESEND_DEV_OVERRIDE=your@email.com in Vercel env vars.
 *   When set, ALL emails are redirected to that address — no exceptions.
 *   No code path can bypass this. Use this while the app is in development.
 *
 * Test Mode Safeguard (DB-level, applied when dev override is not set):
 *   When email_test_mode=true in settings, all emails are redirected to
 *   the whitelist and prefixed with [TEST] banner.
 */

import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  testMode?: boolean;
}

const FROM_EMAIL = "onboarding@resend.dev";
const FROM_NAME = "Ossy from Collective OS";

async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Send an email via Resend API.
 *
 * Falls back to console logging in development if RESEND_API_KEY is not set.
 * In test mode, redirects all recipients to the whitelist and adds a banner.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  let { to, cc, bcc, subject, html } = options;
  const { text, replyTo, tags } = options;

  // ── DEV OVERRIDE (env-level, checked first, cannot be bypassed) ───────────
  const devOverride = process.env.RESEND_DEV_OVERRIDE?.trim();
  if (devOverride) {
    const originalTo = [to].flat().join(", ");
    to = devOverride;
    cc = [];
    bcc = [];
    subject = `[DEV → ${originalTo}] ${subject}`;
    html =
      `<div style="background:#fef3c7;padding:12px;margin-bottom:16px;border-left:4px solid #f59e0b;font-family:sans-serif;font-size:13px;">` +
      `<strong>🔒 DEV MODE</strong> — Original recipient: <strong>${originalTo}</strong>` +
      `</div>` +
      (html ?? "");
    console.log(`[Email] DEV OVERRIDE active — redirecting to ${devOverride} (was: ${originalTo})`);
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Test mode intercept (DB-level, only runs when no dev override) ────────
  const testMode = !devOverride && (await getSetting("email_test_mode")) === "true";
  if (testMode) {
    const whitelistRaw = (await getSetting("email_test_whitelist")) ?? "";
    const whitelist = whitelistRaw.split(",").map((s) => s.trim()).filter(Boolean);

    if (whitelist.length === 0) {
      console.warn("[Email] Test mode ON but whitelist is empty — email suppressed.");
      return { success: true, messageId: `suppressed_${Date.now()}`, testMode: true };
    }

    const originalTo = [to].flat().join(", ");
    to = whitelist;
    cc = [];
    bcc = [];
    subject = `[TEST → ${originalTo}] ${subject}`;
    html =
      `<div style="background:#fff3cd;padding:12px;margin-bottom:16px;border-left:4px solid #f59e0b;font-family:sans-serif;font-size:13px;">` +
      `<strong>⚠️ TEST MODE</strong> — This email was originally addressed to: <strong>${originalTo}</strong>` +
      `</div>` +
      (html ?? "");
  }
  // ─────────────────────────────────────────────────────────────────────────

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("[Email] No RESEND_API_KEY set. Would send:", {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      testMode,
    });
    return { success: true, messageId: `dev_${Date.now()}`, testMode };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: Array.isArray(to) ? to : [to],
        cc: cc
          ? Array.isArray(cc)
            ? cc
            : [cc]
          : undefined,
        bcc: bcc
          ? Array.isArray(bcc)
            ? bcc
            : [bcc]
          : undefined,
        subject,
        html,
        text,
        reply_to: replyTo,
        tags,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Email] Send failed:", err);
      return { success: false, error: err, testMode };
    }

    const data = await res.json();
    return { success: true, messageId: data.id, testMode };
  } catch (err) {
    console.error("[Email] Send error:", err);
    return { success: false, error: String(err), testMode };
  }
}

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
