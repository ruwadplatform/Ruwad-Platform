import type { AdvisorSummary, AvailabilityFilter } from "./advisory-types.ts";

/** Riyadh is UTC+3 all year (no daylight saving), so Riyadh wall-clock time is a fixed offset from UTC. */
const RIYADH_OFFSET_MINUTES = 3 * 60;
/** A slot that starts sooner than this from now is not offered. */
export const MIN_NOTICE_MINUTES = 120;
const SEARCH_DAYS = 21;

const pad = (n: number) => String(n).padStart(2, "0");

/** Riyadh calendar date and weekday for an instant, without any time-zone database. */
function riyadhParts(instant: Date): { y: number; m: number; d: number; weekday: number } {
  const shifted = new Date(instant.getTime() + RIYADH_OFFSET_MINUTES * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

/** The instant a Riyadh date + "HH:MM" refers to. */
export function riyadhInstant(y: number, m: number, d: number, time: string): Date {
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - RIYADH_OFFSET_MINUTES * 60_000);
}

export interface NextSlot {
  /** The slot's start as an instant. */
  at: Date;
  /** Whole Riyadh calendar days from today (0 = today). */
  daysFromToday: number;
  /** Riyadh date "YYYY-MM-DD". */
  date: string;
  time: string;
}

/** The soonest slot an advisor offers from `now`, honouring the minimum notice; null if there is none in the next three weeks. */
export function nextAvailableSlot(advisor: Pick<AdvisorSummary, "availability">, now: Date = new Date()): NextSlot | null {
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60_000;
  for (let i = 0; i < SEARCH_DAYS; i++) {
    const day = riyadhParts(new Date(now.getTime() + i * 86_400_000));
    const rule = advisor.availability.find((a) => a.weekday === day.weekday);
    if (!rule) continue;
    const times = [...rule.times].sort();
    for (const time of times) {
      const at = riyadhInstant(day.y, day.m, day.d, time);
      // Riyadh has a fixed UTC offset, so the i-th day after `now` is exactly i Riyadh calendar days after today.
      if (at.getTime() >= earliest) return { at, daysFromToday: i, date: `${day.y}-${pad(day.m)}-${pad(day.d)}`, time };
    }
  }
  return null;
}

const WINDOW_DAYS: Record<Exclude<AvailabilityFilter, "any">, number> = { today: 0, week: 7, twoWeeks: 14 };

/** Does the advisor have a slot inside the chosen availability window? */
export function matchesAvailability(advisor: Pick<AdvisorSummary, "availability">, filter: AvailabilityFilter, now: Date = new Date()): boolean {
  if (filter === "any") return true;
  const slot = nextAvailableSlot(advisor, now);
  return !!slot && slot.daysFromToday <= WINDOW_DAYS[filter];
}

/** "Mon 26 Oct · 10:00 AM" in Riyadh time. */
export function formatSlot(slot: NextSlot): string {
  const [y, m, d] = slot.date.split("-").map(Number);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  const [hh, mm] = slot.time.split(":").map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${day} · ${pad(h12)}:${pad(mm)} ${hh < 12 ? "AM" : "PM"}`;
}
