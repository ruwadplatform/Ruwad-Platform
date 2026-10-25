import { BookingStatus } from "./advisory.enums";

/** The booking life cycle. Same VALID_TRANSITIONS guard the submissions and model-registry services use: every status change goes through
 * `assertTransition`, so no code path can move a booking somewhere this table doesn't allow.
 *
 *   PENDING ─approve→ CONFIRMED ─complete→ COMPLETED
 *      │ ╲reject→ REJECTED        │ ╲cancel→ CANCELLED
 *      ╰cancel→ CANCELLED         ╰ both sides accept a proposed time→ RESCHEDULED (and the proposal becomes CONFIRMED)
 *
 *   RESCHEDULE_PROPOSED ─accept→ CONFIRMED          (the original, still CONFIRMED until then, becomes RESCHEDULED)
 *                       ─decline→ REJECTED          (the other party said no; the original is untouched)
 *                       ─withdraw / original cancelled→ CANCELLED */
export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.RESCHEDULED],
  [BookingStatus.RESCHEDULE_PROPOSED]: [BookingStatus.CONFIRMED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
  [BookingStatus.REJECTED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.RESCHEDULED]: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** Throws a plain Error naming the move; the services turn it into an HTTP 409. */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) throw new InvalidBookingTransition(from, to);
}

export class InvalidBookingTransition extends Error {
  constructor(public readonly from: BookingStatus, public readonly to: BookingStatus) {
    super(`A ${from.toLowerCase().replace(/_/g, " ")} booking can't become ${to.toLowerCase().replace(/_/g, " ")}.`);
  }
}

