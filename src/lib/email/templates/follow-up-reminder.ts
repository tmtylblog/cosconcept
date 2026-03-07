/**
 * Follow-Up Reminder Email Template
 *
 * Sent when a partnership intro or opportunity share hasn't received a response.
 */

interface FollowUpData {
  recipientName: string;
  originalSubject: string;
  daysSinceOriginal: number;
  partnerFirmName?: string;
  contextSnippet: string;
  actionUrl: string;
}

export function buildFollowUpHtml(data: FollowUpData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px; }
    .logo { color: #6366f1; font-size: 20px; font-weight: 700; }
    .context-box { background: #f8f9fa; border-left: 3px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .cta { background: #6366f1; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-top: 16px; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Collective OS</div>
    </div>

    <p>Hi ${data.recipientName},</p>

    <p>Just a friendly nudge — it's been ${data.daysSinceOriginal} days since ${data.partnerFirmName ? `the introduction to ${data.partnerFirmName}` : `your last activity on "${data.originalSubject}"`}.</p>

    <div class="context-box">
      ${data.contextSnippet}
    </div>

    <p>Partnerships move fast, and I'd hate for this connection to go cold. Want to take the next step?</p>

    <a href="${data.actionUrl}" class="cta">View on Collective OS</a>

    <div class="footer">
      <p>Sent by Ossy, the AI assistant at <a href="https://joincollectiveos.com">Collective OS</a></p>
      <p><a href="https://joincollectiveos.com/settings/email">Manage email preferences</a></p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function buildFollowUpText(data: FollowUpData): string {
  return `Hi ${data.recipientName},

Just a friendly nudge — it's been ${data.daysSinceOriginal} days since ${data.partnerFirmName ? `the introduction to ${data.partnerFirmName}` : `your last activity on "${data.originalSubject}"`}.

${data.contextSnippet}

Partnerships move fast, and I'd hate for this connection to go cold. Want to take the next step?

View on Collective OS: ${data.actionUrl}

---
Sent by Ossy, the AI assistant at Collective OS
https://joincollectiveos.com`;
}
