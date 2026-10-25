import { AvailabilityInput, slotsForDate } from "./advisory-slots";
import { MAX_BOOKING_DAYS, addDays, riyadhDate } from "./advisory-time";

/** The directory only looks this far ahead for an advisor's next slot. */
export const DIRECTORY_SEARCH_DAYS = 21;

export interface NextAvailable {
  /** ISO-8601 instant the slot starts. */
  startsAt: string;
  /** The consultation length it was computed for (the advisor's shortest active service). */
  minutes: number;
}

/** The soonest slot the advisor really offers: the SAME engine the booking calendar uses, so it already respects weekly hours, time off, the
 * two-hour notice and every PENDING / CONFIRMED / proposed booking that holds a time. Null when there is none inside the search horizon, or
 * when `minutes` is unknown (an advisor with no active service). */
export function nextAvailableFor(input: AvailabilityInput, minutes: number | null, now: Date): NextAvailable | null {
  if (!minutes) return null;
  const today = riyadhDate(now);
  for (let i = 0; i < Math.min(DIRECTORY_SEARCH_DAYS, MAX_BOOKING_DAYS); i++) {
    const first = slotsForDate(input, addDays(today, i), minutes, now)[0];
    if (first) return { startsAt: first.start.toISOString(), minutes };
  }
  return null;
}
