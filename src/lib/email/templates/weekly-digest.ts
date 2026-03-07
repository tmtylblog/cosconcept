/**
 * Weekly Digest Email Template
 *
 * Sent every Monday morning with a summary of:
 * - New partner matches
 * - Pending follow-ups
 * - Opportunity updates
 * - Partnership activity
 */

interface DigestMatch {
  firmName: string;
  matchScore: number;
  reason: string;
  profileUrl: string;
}

interface DigestFollowUp {
  description: string;
  daysPending: number;
  actionUrl: string;
}

interface DigestOpportunity {
  title: string;
  status: string;
  sharedWith: number;
  claimed: number;
}

interface WeeklyDigestData {
  recipientName: string;
  firmName: string;
  weekOf: string;
  newMatches: DigestMatch[];
  pendingFollowUps: DigestFollowUp[];
  opportunityUpdates: DigestOpportunity[];
  stats: {
    activePartners: number;
    referralsGiven: number;
    referralsReceived: number;
    estimatedRevenue: string;
  };
  dashboardUrl: string;
}

export function buildDigestHtml(data: WeeklyDigestData): string {
  const matchesSection =
    data.newMatches.length > 0
      ? `
    <div class="section">
      <h2 style="color: #6366f1; font-size: 18px; margin-bottom: 12px;">New Partner Matches</h2>
      ${data.newMatches
        .map(
          (m) => `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${m.firmName}</strong>
            <span class="score">${Math.round(m.matchScore * 100)}% match</span>
          </div>
          <p style="color: #6b7280; margin: 4px 0;">${m.reason}</p>
          <a href="${m.profileUrl}" style="color: #6366f1; font-size: 14px;">View profile →</a>
        </div>`
        )
        .join("")}
    </div>`
      : "";

  const followUpsSection =
    data.pendingFollowUps.length > 0
      ? `
    <div class="section">
      <h2 style="color: #f59e0b; font-size: 18px; margin-bottom: 12px;">Pending Follow-ups</h2>
      ${data.pendingFollowUps
        .map(
          (f) => `
        <div class="card">
          <p><strong>${f.description}</strong> — ${f.daysPending} days pending</p>
          <a href="${f.actionUrl}" style="color: #6366f1; font-size: 14px;">Take action →</a>
        </div>`
        )
        .join("")}
    </div>`
      : "";

  const oppsSection =
    data.opportunityUpdates.length > 0
      ? `
    <div class="section">
      <h2 style="color: #10b981; font-size: 18px; margin-bottom: 12px;">Opportunity Updates</h2>
      ${data.opportunityUpdates
        .map(
          (o) => `
        <div class="card">
          <strong>${o.title}</strong>
          <span style="color: #6b7280;"> — ${o.status}</span>
          <p style="color: #6b7280; margin: 4px 0;">Shared with ${o.sharedWith} partners, ${o.claimed} claimed</p>
        </div>`
        )
        .join("")}
    </div>`
      : "";

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
    .section { margin-bottom: 28px; }
    .card { background: #f8f9fa; border-radius: 8px; padding: 14px 16px; margin: 8px 0; }
    .score { background: #6366f1; color: white; padding: 2px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .stat-box { background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #6366f1; }
    .stat-label { font-size: 13px; color: #6b7280; }
    .cta { background: #6366f1; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-top: 16px; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Collective OS — Weekly Digest</div>
      <p style="color: #6b7280; margin: 4px 0 0;">Week of ${data.weekOf} for ${data.firmName}</p>
    </div>

    <p>Hi ${data.recipientName}, here's your partnership activity this week:</p>

    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value">${data.stats.activePartners}</div>
        <div class="stat-label">Active Partners</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.stats.referralsGiven}</div>
        <div class="stat-label">Referrals Given</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.stats.referralsReceived}</div>
        <div class="stat-label">Referrals Received</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.stats.estimatedRevenue}</div>
        <div class="stat-label">Est. Revenue</div>
      </div>
    </div>

    ${matchesSection}
    ${followUpsSection}
    ${oppsSection}

    <a href="${data.dashboardUrl}" class="cta">Open Dashboard</a>

    <div class="footer">
      <p>Sent by Ossy, the AI assistant at <a href="https://joincollectiveos.com">Collective OS</a></p>
      <p><a href="https://joincollectiveos.com/settings/email">Manage email preferences</a></p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function buildDigestText(data: WeeklyDigestData): string {
  let text = `Collective OS — Weekly Digest\nWeek of ${data.weekOf} for ${data.firmName}\n\n`;
  text += `Hi ${data.recipientName}, here's your partnership activity this week:\n\n`;
  text += `Active Partners: ${data.stats.activePartners}\n`;
  text += `Referrals Given: ${data.stats.referralsGiven}\n`;
  text += `Referrals Received: ${data.stats.referralsReceived}\n`;
  text += `Est. Revenue: ${data.stats.estimatedRevenue}\n\n`;

  if (data.newMatches.length > 0) {
    text += `--- New Partner Matches ---\n`;
    for (const m of data.newMatches) {
      text += `${m.firmName} (${Math.round(m.matchScore * 100)}% match) — ${m.reason}\n`;
    }
    text += "\n";
  }

  if (data.pendingFollowUps.length > 0) {
    text += `--- Pending Follow-ups ---\n`;
    for (const f of data.pendingFollowUps) {
      text += `${f.description} — ${f.daysPending} days pending\n`;
    }
    text += "\n";
  }

  if (data.opportunityUpdates.length > 0) {
    text += `--- Opportunity Updates ---\n`;
    for (const o of data.opportunityUpdates) {
      text += `${o.title} — ${o.status} (shared with ${o.sharedWith}, ${o.claimed} claimed)\n`;
    }
    text += "\n";
  }

  text += `\nOpen Dashboard: ${data.dashboardUrl}\n\n`;
  text += `---\nSent by Ossy, the AI assistant at Collective OS\nhttps://joincollectiveos.com`;
  return text;
}
