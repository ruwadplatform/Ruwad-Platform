import { BookingStatus, SLOT_HOLDING_STATUSES } from "./advisory.enums";
import { InvalidBookingTransition, VALID_TRANSITIONS, assertTransition, canTransition } from "./booking-state";

const S = BookingStatus;

describe("booking status machine", () => {
  it("allows exactly the documented moves", () => {
    expect(VALID_TRANSITIONS[S.PENDING]).toEqual([S.CONFIRMED, S.REJECTED, S.CANCELLED, S.EXPIRED]);
    expect(VALID_TRANSITIONS[S.CONFIRMED]).toEqual([S.COMPLETED, S.CANCELLED, S.RESCHEDULED]);
    expect(VALID_TRANSITIONS[S.RESCHEDULE_PROPOSED]).toEqual([S.CONFIRMED, S.REJECTED, S.CANCELLED, S.EXPIRED]);
  });

  it("REJECTED, CANCELLED, COMPLETED, RESCHEDULED and EXPIRED are terminal", () => {
    for (const s of [S.REJECTED, S.CANCELLED, S.COMPLETED, S.RESCHEDULED, S.EXPIRED]) expect(VALID_TRANSITIONS[s]).toEqual([]);
  });

  it("only an unanswered request or proposal can expire; a CONFIRMED booking never does", () => {
    expect(canTransition(S.PENDING, S.EXPIRED)).toBe(true);
    expect(canTransition(S.RESCHEDULE_PROPOSED, S.EXPIRED)).toBe(true);
    expect(canTransition(S.CONFIRMED, S.EXPIRED)).toBe(false);
    expect(canTransition(S.EXPIRED, S.CONFIRMED)).toBe(false); // an expired request can't be approved late
  });

  it("a pending request can't jump to completed, and a confirmed one can't go back to pending", () => {
    expect(canTransition(S.PENDING, S.COMPLETED)).toBe(false);
    expect(canTransition(S.CONFIRMED, S.PENDING)).toBe(false);
    expect(canTransition(S.CONFIRMED, S.REJECTED)).toBe(false);
  });

  it("only a proposal can become CONFIRMED from outside PENDING: a confirmed booking never re-confirms itself", () => {
    expect(canTransition(S.CONFIRMED, S.CONFIRMED)).toBe(false);
    expect(canTransition(S.RESCHEDULE_PROPOSED, S.CONFIRMED)).toBe(true);
  });

  it("assertTransition throws a readable error for a forbidden move", () => {
    expect(() => assertTransition(S.CANCELLED, S.CONFIRMED)).toThrow(InvalidBookingTransition);
    expect(() => assertTransition(S.CANCELLED, S.CONFIRMED)).toThrow("A cancelled booking can't become confirmed.");
    expect(() => assertTransition(S.PENDING, S.CONFIRMED)).not.toThrow();
  });

  it("every status is covered by the table", () => {
    for (const s of Object.values(S)) expect(VALID_TRANSITIONS[s]).toBeDefined();
  });

  it("slot-holding statuses are exactly the ones the database exclusion constraint lists", () => {
    expect([...SLOT_HOLDING_STATUSES].sort()).toEqual([S.CONFIRMED, S.PENDING, S.RESCHEDULE_PROPOSED].sort());
  });
});
