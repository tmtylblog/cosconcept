/**
 * Three-Way Introduction Email Template
 *
 * Used when Ossy introduces two firms that should partner.
 * Sent from ossy@joincollectiveos.com with both parties CC'd.
 */

interface IntroEmailData {
  firmAName: string;
  firmBName: string;
  firmAContact: { name: string; email: string };
  firmBContact: { name: string; email: string };
  reason: string;
  firmAStrengths: string[];
  firmBStrengths: string[];
  suggestedNextStep: string;
}

export function buildIntroEmailHtml(data: IntroEmailData): string {
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
    .section { margin-bottom: 20px; }
    .firm-box { background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .firm-name { font-weight: 600; color: #6366f1; font-size: 16px; }
    .strengths { margin: 8px 0; padding-left: 20px; }
    .cta { background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-top: 16px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Collective OS</div>
    </div>

    <p>Hi ${data.firmAContact.name} and ${data.firmBContact.name},</p>

    <p>I'm Ossy from Collective OS, and I'm making this introduction because I think you two would make excellent partners.</p>

    <div class="section">
      <p><strong>Why this match:</strong> ${data.reason}</p>
    </div>

    <div class="firm-box">
      <div class="firm-name">${data.firmAName}</div>
      <ul class="strengths">
        ${data.firmAStrengths.map((s) => `<li>${s}</li>`).join("\n        ")}
      </ul>
    </div>

    <div class="firm-box">
      <div class="firm-name">${data.firmBName}</div>
      <ul class="strengths">
        ${data.firmBStrengths.map((s) => `<li>${s}</li>`).join("\n        ")}
      </ul>
    </div>

    <div class="section">
      <p><strong>Suggested next step:</strong> ${data.suggestedNextStep}</p>
    </div>

    <p>I'll leave it to you two to take it from here. Feel free to reply-all if you'd like me to help coordinate.</p>

    <div class="footer">
      <p>Sent by Ossy, the AI assistant at <a href="https://joincollectiveos.com">Collective OS</a></p>
      <p>You received this email because your firm is on Collective OS. <a href="https://joincollectiveos.com/settings/email">Manage email preferences</a></p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function buildIntroEmailText(data: IntroEmailData): string {
  return `Hi ${data.firmAContact.name} and ${data.firmBContact.name},

I'm Ossy from Collective OS, and I'm making this introduction because I think you two would make excellent partners.

Why this match: ${data.reason}

${data.firmAName}:
${data.firmAStrengths.map((s) => `- ${s}`).join("\n")}

${data.firmBName}:
${data.firmBStrengths.map((s) => `- ${s}`).join("\n")}

Suggested next step: ${data.suggestedNextStep}

I'll leave it to you two to take it from here. Feel free to reply-all if you'd like me to help coordinate.

---
Sent by Ossy, the AI assistant at Collective OS
https://joincollectiveos.com`;
}
