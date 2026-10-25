import type { AdvisoryAutomationConfig } from "./advisory-config";

/** The scheduler's rules as plain functions of time, so they can be tested exhaustively. The scheduler applies the same conditions in SQL (it has to
 * claim rows atomically); the tests in advisory-automation.spec.ts and the integration suite keep the two in step. */

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** When an unanswered request expires: `requestExpiryHours` after it was made, but never later than `cutoffMinutes` before the consultation starts
 * (an advisor can't usefully answer a request for a consultation that is about to begin). */
export function computeExpiresAt(madeAt: Date, startsAt: Date, cfg: Pick<AdvisoryAutomationConfig, "requestExpiryHours" | "cutoffMinutes">): Date {
  const byAge = madeAt.getTime() + cfg.requestExpiryHours * HOUR;
  const byStart = startsAt.getTime() - cfg.cutoffMinutes * MINUTE;
  return new Date(Math.min(byAge, byStart));
}

/** When an unanswered reschedule proposal expires: the same rule, and also before either the original or the proposed time arrives. */
export function computeProposalExpiresAt(madeAt: Date, originalStartsAt: Date, proposedStartsAt: Date, cfg: Pick<AdvisoryAutomationConfig, "requestExpiryHours" | "cutoffMinutes">): Date {
  const first = originalStartsAt.getTime() < proposedStartsAt.getTime() ? originalStartsAt : proposedStartsAt;
  return computeExpiresAt(madeAt, first, cfg);
}

/** Should the advisor be warned now that this request is about to expire? Only if the request lived long enough for a warning to be useful
 * (made more than `warningHours` before its expiry), the warning window has opened, it hasn't expired yet, and none has been sent. */
export function expiryWarningDue(b: { createdAt: Date; expiresAt: Date | null; expiryWarningSentAt: Date | null }, now: Date, warningHours: number): boolean {
  if (!b.expiresAt || b.expiryWarningSentAt) return false;
  const windowOpens = b.expiresAt.getTime() - warningHours * HOUR;
  return b.createdAt.getTime() < windowOpens && now.getTime() >= windowOpens && now.getTime() < b.expiresAt.getTime();
}

/** Is a reminder `hoursBefore` hours ahead of the start due? It is once the window has opened and the consultation hasn't started, unless it was
 * only confirmed after that point (a consultation confirmed 30 minutes before it starts doesn't need a "24 hours" reminder; the confirmation
 * email already told them). */
export function reminderDue(b: { startsAt: Date; confirmedAt: Date; sentAt: Date | null }, hoursBefore: number, now: Date): boolean {
  if (b.sentAt) return false;
  const windowOpens = b.startsAt.getTime() - hoursBefore * HOUR;
  return now.getTime() >= windowOpens && now.getTime() < b.startsAt.getTime() && b.confirmedAt.getTime() <= windowOpens;
}
