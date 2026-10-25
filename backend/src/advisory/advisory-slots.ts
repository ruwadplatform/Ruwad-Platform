import { MAX_BOOKING_DAYS, MIN_NOTICE_MINUTES, SLOT_STEP_MINUTES, Ymd, addDays, daysBetween, minutesOf, riyadhDate, riyadhInstant, timeOf, weekdayOf, ymdKey } from "./advisory-time";

/** The slot engine. Pure: it is handed everything it needs (the advisor's weekly windows, time off, and the intervals already held) and does no I/O,
 * so the server can validate a booking against exactly what it offered, and the tests can pin every rule. */

export interface WeeklyWindow { weekday: number; startTime: string; endTime: string }
export interface TimeOff { date: string; startTime: string | null; endTime: string | null }
export interface BusyInterval { start: Date; end: Date }
export interface AvailabilityInput { rules: WeeklyWindow[]; timeOff: TimeOff[]; busy: BusyInterval[] }

export interface Slot {
  /** "HH:MM" start, Riyadh time. */
  time: string;
  start: Date;
  end: Date;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/** The consultation slots an advisor offers on a Riyadh date for a consultation of `minutes`.
 *
 * A slot is offered when the whole consultation fits inside one weekly window on a 30-minute grid, starts at least the minimum notice from
 * `now`, is within the booking horizon, does not touch the advisor's time off, and does not overlap an interval that is already held. */
export function slotsForDate(input: AvailabilityInput, date: Ymd, minutes: number, now: Date = new Date()): Slot[] {
  const ahead = daysBetween(riyadhDate(now), date);
  if (ahead < 0 || ahead > MAX_BOOKING_DAYS) return [];
  const key = ymdKey(date);
  const off = input.timeOff.filter((t) => t.date === key);
  if (off.some((t) => t.startTime === null)) return [];
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60_000;
  const weekday = weekdayOf(date);
  const out: Slot[] = [];
  for (const w of input.rules.filter((r) => r.weekday === weekday)) {
    for (let t = minutesOf(w.startTime); t + minutes <= minutesOf(w.endTime); t += SLOT_STEP_MINUTES) {
      const time = timeOf(t);
      const start = riyadhInstant(date, time);
      const end = new Date(start.getTime() + minutes * 60_000);
      if (start.getTime() < earliest) continue;
      if (off.some((o) => overlaps(t, t + minutes, minutesOf(o.startTime!), minutesOf(o.endTime!)))) continue;
      if (input.busy.some((b) => overlaps(start.getTime(), end.getTime(), b.start.getTime(), b.end.getTime()))) continue;
      out.push({ time, start, end });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Riyadh dates in the booking horizon that have at least one slot, as "YYYY-MM-DD" keys. */
export function datesWithSlots(input: AvailabilityInput, minutes: number, now: Date = new Date()): string[] {
  const today = riyadhDate(now);
  const out: string[] = [];
  for (let i = 0; i <= MAX_BOOKING_DAYS; i++) {
    const d = addDays(today, i);
    if (slotsForDate(input, d, minutes, now).length) out.push(ymdKey(d));
  }
  return out;
}

/** Whether `start` is exactly one of the slots offered for its Riyadh date — the server's check that a requested time is a real, still-open slot. */
export function isOfferedSlot(input: AvailabilityInput, start: Date, minutes: number, now: Date = new Date()): boolean {
  const date = riyadhDate(start);
  return slotsForDate(input, date, minutes, now).some((s) => s.start.getTime() === start.getTime());
}
