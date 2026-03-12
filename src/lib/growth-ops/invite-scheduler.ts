import { randomUUID } from "crypto";

const MAX_DAILY_INVITES = 25;
const DAY_ABBRS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Builds a schedule of invite timestamps for a campaign.
 *
 * @param targetIds             List of target IDs to schedule
 * @param linkedinAccountId     Account to send from
 * @param campaignId            Campaign this schedule belongs to
 * @param options.dailyTarget   Base invites/day (±40% variance applied, capped at 25)
 * @param options.activeDays    Days to send (default Mon–Sat)
 * @param options.activeHoursStart  Start hour UTC (default 8)
 * @param options.activeHoursEnd    End hour UTC (default 18)
 * @param startFrom             Schedule start date (default now)
 */
export function buildInviteSchedule(
  targetIds: string[],
  linkedinAccountId: string,
  campaignId: string,
  options: {
    dailyTarget: number;
    activeDays?: string[];
    activeHoursStart?: number;
    activeHoursEnd?: number;
  },
  startFrom: Date = new Date()
): Array<{
  id: string;
  campaignId: string;
  targetId: string;
  linkedinAccountId: string;
  scheduledAt: Date;
  status: string;
}> {
  const {
    dailyTarget,
    activeDays = ["mon", "tue", "wed", "thu", "fri", "sat"],
    activeHoursStart = 8,
    activeHoursEnd = 18,
  } = options;

  const queue: ReturnType<typeof buildInviteSchedule> = [];
  const remaining = [...targetIds];

  let day = new Date(startFrom);
  day.setUTCHours(activeHoursStart, 0, 0, 0);

  // Advance to first active day
  while (!activeDays.includes(DAY_ABBRS[day.getUTCDay()])) {
    day = addDays(day, 1);
  }

  while (remaining.length > 0) {
    if (!activeDays.includes(DAY_ABBRS[day.getUTCDay()])) {
      day = addDays(day, 1);
      continue;
    }

    // Apply ±40% variance around dailyTarget, cap at MAX_DAILY_INVITES
    const variance = dailyTarget * 0.4;
    const raw = Math.round(dailyTarget + (Math.random() * 2 - 1) * variance);
    const count = Math.max(1, Math.min(MAX_DAILY_INVITES, raw));
    const todayTargets = remaining.splice(0, count);

    // Spread timestamps across the active window
    const windowMs = (activeHoursEnd - activeHoursStart) * 60 * 60 * 1000;
    const minGapMs = 5 * 60 * 1000;
    const dayStart = new Date(day);
    dayStart.setUTCHours(activeHoursStart, 0, 0, 0);

    const times: Date[] = [];
    for (let i = 0; i < todayTargets.length; i++) {
      let t: Date;
      let attempts = 0;
      do {
        const offsetMs = Math.floor(Math.random() * windowMs);
        t = new Date(dayStart.getTime() + offsetMs);
        attempts++;
      } while (
        attempts < 50 &&
        times.some((existing) => Math.abs(existing.getTime() - t.getTime()) < minGapMs)
      );
      times.push(t);
    }
    times.sort((a, b) => a.getTime() - b.getTime());

    for (let i = 0; i < todayTargets.length; i++) {
      queue.push({
        id: randomUUID(),
        campaignId,
        targetId: todayTargets[i],
        linkedinAccountId,
        scheduledAt: times[i],
        status: "queued",
      });
    }

    day = addDays(day, 1);
  }

  return queue;
}
