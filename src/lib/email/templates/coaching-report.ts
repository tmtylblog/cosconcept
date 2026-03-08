/**
 * Coaching Report Email Template
 *
 * HTML email from Ossy with post-call coaching analysis.
 * Sent to platform members after their calls.
 * For partnership calls: sent separately to each firm (neither sees the other's).
 * For client calls: sent only to the platform member.
 */

import type { CallCoachingAnalysis } from "@/lib/ai/coaching-analyzer";

interface CoachingEmailData {
  firmName: string;
  callDate: Date;
  callDurationMinutes?: number;
  callType: "partnership" | "client" | "unknown";
  coaching: CallCoachingAnalysis;
  recommendedExperts?: { name: string; firm: string; reason: string; profileUrl?: string }[];
  recommendedCaseStudies?: { title: string; firm: string; relevance: string; url?: string }[];
  callId: string;
}

export function buildCoachingReportEmail(data: CoachingEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    firmName,
    callDate,
    callDurationMinutes,
    coaching,
    recommendedExperts,
    recommendedCaseStudies,
  } = data;

  const dateStr = callDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const subject = `Your call recap from Ossy — ${dateStr}`;

  const scoreColor =
    coaching.overallScore >= 80
      ? "#60b9bf"
      : coaching.overallScore >= 60
        ? "#f3af3d"
        : "#e44627";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f6f4ef;">
  <div style="max-width:620px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 16px;">
      <p style="margin:0;font-size:13px;color:#1f86a1;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Collective OS</p>
      <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#3a302d;">Your Call Recap</h1>
      <p style="margin:0;font-size:13px;color:#6b7280;">${dateStr}${callDurationMinutes ? ` · ${callDurationMinutes} min` : ""}</p>
    </div>

    <!-- Score badge -->
    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;text-align:center;border:1px solid #e5e7eb;">
      <div style="display:inline-block;background:${scoreColor}1a;border:2px solid ${scoreColor};border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;margin-bottom:12px;">
        <span style="font-size:24px;font-weight:800;color:${scoreColor};">${coaching.overallScore}</span>
      </div>
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Overall Score</p>

      <!-- Top recommendation -->
      <div style="margin-top:16px;padding:14px 16px;background:#f6f4ef;border-radius:10px;text-align:left;border-left:3px solid ${scoreColor};">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${scoreColor};text-transform:uppercase;letter-spacing:0.05em;">Top Recommendation</p>
        <p style="margin:0;font-size:14px;color:#3a302d;line-height:1.5;">${coaching.topRecommendation}</p>
      </div>
    </div>

    <!-- Coaching sections -->
    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <h2 style="margin:0 0 20px;font-size:16px;font-weight:700;color:#3a302d;">Call Analysis</h2>

      ${buildCoachingSection("Talk Time", buildTalkTimeContent(coaching))}
      ${buildCoachingSection("Value Proposition", buildValuePropContent(coaching))}
      ${buildCoachingSection("Question Quality", buildQuestionContent(coaching))}

      ${coaching.nextSteps.established && coaching.nextSteps.items.length > 0
        ? buildCoachingSection("Next Steps", buildNextStepsContent(coaching))
        : ""}
    </div>

    <!-- Action Items -->
    ${coaching.actionItems.length > 0
      ? `<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 16px;font-size:16px;font-weight:700;color:#3a302d;">Action Items</h2>
          <table style="width:100%;border-collapse:collapse;">
            ${coaching.actionItems
              .map(
                (item) =>
                  `<tr>
                    <td style="padding:8px 0;vertical-align:top;border-bottom:1px solid #f3f4f6;">
                      <div style="display:inline-block;width:8px;height:8px;background:#1f86a1;border-radius:50%;margin-right:10px;vertical-align:middle;"></div>
                      <span style="font-size:13px;color:#3a302d;">${item.description}</span>
                      ${item.assignee ? `<span style="font-size:12px;color:#6b7280;margin-left:8px;">→ ${item.assignee}</span>` : ""}
                    </td>
                  </tr>`
              )
              .join("")}
          </table>
        </div>`
      : ""}

    <!-- Expert Recommendations -->
    ${recommendedExperts && recommendedExperts.length > 0
      ? `<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 6px;font-size:16px;font-weight:700;color:#3a302d;">Recommended Experts</h2>
          <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Platform members who could help with topics discussed.</p>
          ${recommendedExperts
            .slice(0, 4)
            .map(
              (e) =>
                `<div style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                  <div style="display:flex;justify-content:space-between;align-items:start;">
                    <div>
                      <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#3a302d;">${e.name}</p>
                      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">${e.firm}</p>
                      <p style="margin:0;font-size:13px;color:#4b5563;">${e.reason}</p>
                    </div>
                    ${e.profileUrl ? `<a href="${e.profileUrl}" style="font-size:12px;color:#1f86a1;text-decoration:none;white-space:nowrap;margin-left:12px;">View profile →</a>` : ""}
                  </div>
                </div>`
            )
            .join("")}
        </div>`
      : ""}

    <!-- Case Study Recommendations -->
    ${recommendedCaseStudies && recommendedCaseStudies.length > 0
      ? `<div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 6px;font-size:16px;font-weight:700;color:#3a302d;">Relevant Case Studies</h2>
          <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Work from our community relevant to your call.</p>
          ${recommendedCaseStudies
            .slice(0, 3)
            .map(
              (cs) =>
                `<div style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#3a302d;">${cs.title}</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">${cs.firm}</p>
                  <p style="margin:0;font-size:13px;color:#4b5563;">${cs.relevance}</p>
                  ${cs.url ? `<a href="${cs.url}" style="font-size:12px;color:#1f86a1;text-decoration:none;">Read more →</a>` : ""}
                </div>`
            )
            .join("")}
        </div>`
      : ""}

    <!-- Footer -->
    <div style="text-align:center;padding:16px 0;font-size:12px;color:#9ca3af;">
      <p style="margin:0 0 4px;">Reply to this email to ask Ossy anything about your call.</p>
      <p style="margin:0;">Sent by Ossy from <a href="https://joincollectiveos.com" style="color:#1f86a1;text-decoration:none;">Collective OS</a> · Grow Faster Together</p>
    </div>

  </div>
</body>
</html>`;

  const text = `Your Call Recap — ${dateStr}

Overall Score: ${coaching.overallScore}/100

TOP RECOMMENDATION
${coaching.topRecommendation}

TALK TIME
${coaching.talkingTimeRatio.assessment}
You: ${coaching.talkingTimeRatio.userPercent}% | Other party: ${coaching.talkingTimeRatio.otherPercent}%

VALUE PROPOSITION
${coaching.valueProposition.feedback}

QUESTION QUALITY
${coaching.questionQuality.feedback}
Discovery questions: ${coaching.questionQuality.discoveryQuestions} | Closed questions: ${coaching.questionQuality.closedQuestions}

${coaching.actionItems.length > 0 ? `ACTION ITEMS\n${coaching.actionItems.map((a) => `• ${a.description}${a.assignee ? ` (${a.assignee})` : ""}`).join("\n")}` : ""}

---
Reply to this email to ask Ossy anything about your call.
Collective OS · joincollectiveos.com`;

  return { subject, html, text };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCoachingSection(title: string, content: string): string {
  return `<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f3f4f6;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${title}</p>
    ${content}
  </div>`;
}

function buildTalkTimeContent(coaching: CallCoachingAnalysis): string {
  const { userPercent, otherPercent, assessment } = coaching.talkingTimeRatio;
  const ideal = userPercent >= 40 && userPercent <= 60;
  return `<div style="display:flex;gap:8px;margin-bottom:10px;">
    <div style="flex:1;background:#f6f4ef;border-radius:8px;padding:10px 12px;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#3a302d;">${userPercent}%</p>
      <p style="margin:0;font-size:11px;color:#6b7280;">You</p>
    </div>
    <div style="flex:1;background:#f6f4ef;border-radius:8px;padding:10px 12px;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#3a302d;">${otherPercent}%</p>
      <p style="margin:0;font-size:11px;color:#6b7280;">Other party</p>
    </div>
  </div>
  <p style="margin:0;font-size:13px;color:${ideal ? "#60b9bf" : "#f3af3d"};">${assessment}</p>`;
}

function buildValuePropContent(coaching: CallCoachingAnalysis): string {
  const score = Math.round(coaching.valueProposition.clarity * 100);
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <div style="flex:1;height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden;">
      <div style="height:100%;width:${score}%;background:${score >= 70 ? "#60b9bf" : "#f3af3d"};border-radius:2px;"></div>
    </div>
    <span style="font-size:12px;font-weight:600;color:#3a302d;">${score}%</span>
  </div>
  <p style="margin:0;font-size:13px;color:#4b5563;">${coaching.valueProposition.feedback}</p>`;
}

function buildQuestionContent(coaching: CallCoachingAnalysis): string {
  return `<p style="margin:0 0 6px;font-size:13px;color:#4b5563;">${coaching.questionQuality.feedback}</p>
  <p style="margin:0;font-size:12px;color:#6b7280;">
    ${coaching.questionQuality.discoveryQuestions} discovery · ${coaching.questionQuality.closedQuestions} closed
  </p>`;
}

function buildNextStepsContent(coaching: CallCoachingAnalysis): string {
  return `<ul style="margin:0;padding-left:16px;">
    ${coaching.nextSteps.items
      .map((item) => `<li style="font-size:13px;color:#4b5563;margin-bottom:4px;">${item}</li>`)
      .join("")}
  </ul>`;
}
