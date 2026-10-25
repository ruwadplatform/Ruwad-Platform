import { MAX_BOOKING_DAYS, MIN_NOTICE_MINUTES, addDays, daysBetween, minutesOf, riyadhDate, riyadhInstant, timeOf, weekdayOf, ymdKey, type Ymd } from "./advisory-time.ts";
import type { AdvisorSummary } from "./advisory-types.ts";

/** Slots start on this grid inside an advisor's availability windows. */
export const SLOT_STEP_MINUTES = 30;

export interface Slot {
  /** "HH:MM" start, Riyadh time. */
  time: string;
  start: Date;
  end: Date;
}

/** The consultation slots an advisor offers on a Riyadh calendar date for a consultation of `minutes`.
 *
 * A slot is offered when the whole consultation fits inside one availability window (so a 60-minute consultation never runs past the end of
 * the window), it starts at least the minimum notice from `now`, and the date is not in the past or beyond the booking horizon. Longer
 * consultations therefore have fewer slots than shorter ones. */
export function slotsForDate(advisor: Pick<AdvisorSummary, "availability">, date: Ymd, minutes: number, now: Date = new Date()): Slot[] {
  const today = riyadhDate(now);
  const ahead = daysBetween(today, date);
  if (ahead < 0 || ahead > MAX_BOOKING_DAYS) return [];
  const rule = advisor.availability.find((a) => a.weekday === weekdayOf(date));
  if (!rule) return [];
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60_000;
  const out: Slot[] = [];
  for (const w of rule.windows) {
    for (let t = minutesOf(w.start); t + minutes <= minutesOf(w.end); t += SLOT_STEP_MINUTES) {
      const time = timeOf(t);
      const start = riyadhInstant(date.y, date.m, date.d, time);
      if (start.getTime() < earliest) continue;
      out.push({ time, start, end: new Date(start.getTime() + minutes * 60_000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Calendar dates in the booking horizon that have at least one slot, as "YYYY-MM-DD" keys. */
export function datesWithSlots(advisor: Pick<AdvisorSummary, "availability">, minutes: number, now: Date = new Date()): Set<string> {
  const today = riyadhDate(now);
  const out = new Set<string>();
  for (let i = 0; i <= MAX_BOOKING_DAYS; i++) {
    const d = addDays(today, i);
    if (slotsForDate(advisor, d, minutes, now).length) out.add(ymdKey(d));
  }
  return out;
}
