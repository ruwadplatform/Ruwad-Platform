/** Pure date-math helpers for label maturity — every function here takes
 * `now` as an explicit parameter (never reads the system clock itself)
 * specifically so tests can inject fixed dates instead of mutating global
 * time. See docs/ml-data-methodology.md for the maturity rules this backs. */

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function windowEnd(snapshotAt: Date, windowMonths: number): Date {
  return addMonths(snapshotAt, windowMonths);
}

/** True once `now` has reached or passed the end of the observation
 * window — the ONLY thing allowed to turn a boolean label's "no evidence
 * yet" into a confirmed negative. */
export function isMatured(snapshotAt: Date, windowMonths: number, now: Date): boolean {
  return now.getTime() >= windowEnd(snapshotAt, windowMonths).getTime();
}

/** True if an event's date falls strictly after the snapshot and at or
 * before the window's end — the one check every label calculator and the
 * dataset exporter both funnel through, so a future event can never leak
 * into an earlier snapshot's window and a same-day snapshot/event edge
 * case is never double-counted. */
export function eventWithinWindow(eventDateIso: string, snapshotAt: Date, windowEndAt: Date): boolean {
  const eventDate = new Date(`${eventDateIso}T00:00:00.000Z`);
  return eventDate.getTime() > snapshotAt.getTime() && eventDate.getTime() <= windowEndAt.getTime();
}
