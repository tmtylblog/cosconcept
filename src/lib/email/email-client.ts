/**
 * Email Client
 *
 * Wraps the email sending provider (Resend).
 * All outbound emails from ossy@joincollectiveos.com route through here.
 */

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
}

const FROM_EMAIL = "ossy@joincollectiveos.com";
const FROM_NAME = "Ossy from Collective OS";

/**
 * Send an email via Resend API.
 *
 * Falls back to console logging in development if RESEND_API_KEY is not set.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("[Email] No RESEND_API_KEY set. Would send:", {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
    });
    return { success: true, messageId: `dev_${Date.now()}` };
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
        to: Array.isArray(options.to) ? options.to : [options.to],
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc
            : [options.cc]
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc
            : [options.bcc]
          : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
        tags: options.tags,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Email] Send failed:", err);
      return { success: false, error: err };
    }

    const data = await res.json();
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error("[Email] Send error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
