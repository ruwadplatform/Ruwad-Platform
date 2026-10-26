import { BookingStatus } from "./advisory.enums";

/** When a consultation's meeting room is open. Pure, so the rules can be tested without a database or a provider. */

const MINUTE = 60_000;

export type MeetingState =
  /** The booking isn't CONFIRMED (pending, cancelled, expired…): there is no meeting. */
  | "NOT_CONFIRMED"
  /** Confirmed, but it is too early to join. */
  | "NOT_OPEN"
  /** People may join now (from a few minutes before the start until a few minutes after the end). */
  | "OPEN"
  /** The window has closed. */
  | "ENDED";

export interface WindowSettings {
  opensBeforeMinutes: number;
  closesAfterMinutes: number;
}

export function meetingWindow(startsAt: Date, endsAt: Date, s: WindowSettings): { opensAt: Date; closesAt: Date } {
  return { opensAt: new Date(startsAt.getTime() - s.opensBeforeMinutes * MINUTE), closesAt: new Date(endsAt.getTime() + s.closesAfterMinutes * MINUTE) };
}

export function meetingState(status: BookingStatus, startsAt: Date, endsAt: Date, now: Date, s: WindowSettings): MeetingState {
  if (status !== BookingStatus.CONFIRMED) return "NOT_CONFIRMED";
  const { opensAt, closesAt } = meetingWindow(startsAt, endsAt, s);
  if (now < opensAt) return "NOT_OPEN";
  if (now > closesAt) return "ENDED";
  return "OPEN";
}

export const MEETING_NOTICE = "This meeting is not recorded. Please do not share patient-identifiable information.";
