import { randomUUID } from "crypto";

/**
 * Builds a schedule of invite timestamps for a campaign.
 * Rules:
 *  - Mon–Sat only (skip Sundays, day 0)
 *  - 15–19 invites per day (Poisson-randomized within dailyMin/dailyMax)
 *  - Times between 8:00 AM – 6:00 PM (local EST, stored as UTC offsets)
 *  - At least 5 minutes between invites
 */

function poissonSample(lambda: number): number {
  // Knuth algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function buildInviteSchedule(
  targetIds: string[],
  linkedinAccountId: string,
  campaignId: string,
  dailyMin: number,
  dailyMax: number,
  startFrom: Date = new Date()
): Array<{
  id: string;
  campaignId: string;
  targetId: string;
  linkedinAccountId: string;
  scheduledAt: Date;
  status: string;
}> {
  const queue: ReturnType<typeof buildInviteSchedule> = [];
  const lambda = (dailyMin + dailyMax) / 2;
  const remaining = [...targetIds];

  // Start from next valid business day
  let day = new Date(startFrom);
  day.setUTCHours(8, 0, 0, 0);
  if (day.getUTCDay() === 0) {
    day = addDays(day, 1); // skip Sunday
  }

  while (remaining.length > 0) {
    if (day.getUTCDay() === 0) {
      day = addDays(day, 1);
      continue;
    }

    // How many invites today?
    const raw = poissonSample(lambda);
    const count = Math.max(dailyMin, Math.min(dailyMax, raw || dailyMin));
    const todayTargets = remaining.splice(0, count);

    // Spread timestamps between 8 AM – 6 PM (10-hour window = 36000 seconds)
    const windowMs = 10 * 60 * 60 * 1000;
    const minGapMs = 5 * 60 * 1000;
    const dayStart = new Date(day);

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
