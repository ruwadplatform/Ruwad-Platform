/** Phase 4 settings, all read from the environment with safe defaults. Nothing here switches anything on by itself:
 *   - the scheduler is OFF unless ADVISORY_SCHEDULER_ENABLED is exactly "true" (and ADVISORY_ENABLED is on);
 *   - automatic completion is OFF unless ADVISORY_AUTOCOMPLETE_ENABLED is exactly "true" — it has NOT been approved, so leave it off;
 *   - email stays in mock mode (ADVISORY_EMAIL_MODE, see advisory-notifier.ts);
 *   - the video provider is "mock" (simulated rooms) unless ADVISORY_VIDEO_PROVIDER is exactly "daily" and its credentials are present. */

export interface AdvisoryAutomationConfig {
  schedulerEnabled: boolean;
  /** How often the in-process scheduler wakes up. */
  tickMs: number;
  /** An unanswered PENDING request expires this many hours after it was made… */
  requestExpiryHours: number;
  /** …but never later than this many minutes before the consultation starts. */
  cutoffMinutes: number;
  /** The advisor is warned this many hours before a request expires. */
  expiryWarningHours: number;
  /** Reminders go out this long before a confirmed consultation (hours). */
  reminderHours: [number, number];
  /** How long after the end the scheduler waits before asking someone what happened. */
  reviewGraceMinutes: number;
  /** Minutes of overlap (both present) that count as "both attended". */
  attendanceMinMinutes: number;
  /** NOT APPROVED: when true, a consultation where both parties attended is completed automatically. Default off. */
  autoComplete: boolean;
  /** The most consultation requests one founder may have waiting for an answer at once, across every advisor (owner decision, Step 6: 2).
   * Only PENDING requests count, and one whose expiry time has passed no longer does, even before the scheduler has swept it. */
  maxPendingPerFounder: number;
}

/** Leave ADVISORY_MAX_PENDING_REQUESTS unset in production: this is the agreed limit. */
export const DEFAULT_MAX_PENDING_REQUESTS = 2;

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function readAutomationConfig(get: (key: string) => string | undefined): AdvisoryAutomationConfig {
  return {
    schedulerEnabled: get("ADVISORY_ENABLED")?.trim() === "true" && get("ADVISORY_SCHEDULER_ENABLED")?.trim() === "true",
    tickMs: num(get("ADVISORY_SCHEDULER_TICK_SECONDS"), 60, 5, 3600) * 1000,
    requestExpiryHours: num(get("ADVISORY_REQUEST_EXPIRY_HOURS"), 72, 1, 24 * 14),
    cutoffMinutes: num(get("ADVISORY_REQUEST_CUTOFF_MINUTES"), 30, 5, 24 * 60),
    expiryWarningHours: num(get("ADVISORY_EXPIRY_WARNING_HOURS"), 24, 1, 24 * 7),
    reminderHours: [24, 1],
    reviewGraceMinutes: num(get("ADVISORY_REVIEW_GRACE_MINUTES"), 30, 5, 24 * 60),
    attendanceMinMinutes: num(get("ADVISORY_ATTENDANCE_MIN_MINUTES"), 5, 1, 120),
    autoComplete: get("ADVISORY_AUTOCOMPLETE_ENABLED")?.trim() === "true",
    maxPendingPerFounder: num(get("ADVISORY_MAX_PENDING_REQUESTS"), DEFAULT_MAX_PENDING_REQUESTS, 1, 50),
  };
}
