import { ApiError } from "@/lib/api/client";
import { RIYADH_TZ, formatClock, formatDateUS, offsetLabel, riyadhDate } from "./advisory-time";
import type { BookingStatus, BookingView } from "./advisory-types";

export { CONSULTATION_TABS, inTab, type ConsultationTab } from "./consultation-tabs";

/** Shared by My Consultations, the advisor dashboard and the admin screen, so a booking reads the same everywhere. */

export const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong. Please try again.");

/** "October 26, 2026 · 10:00 AM" in Riyadh time (or `zone`). */
export function formatWhen(iso: string, zone: string = RIYADH_TZ): string {
  const at = new Date(iso);
  const date = zone === RIYADH_TZ ? riyadhDate(at) : (() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at).split("-").map(Number);
    return { y: parts[0]!, m: parts[1]!, d: parts[2]! };
  })();
  return `${formatDateUS(date)} · ${formatClock(at, zone)}`;
}

export const zoneLabel = (iso: string, zone: string = RIYADH_TZ) => (zone === RIYADH_TZ ? `Riyadh (${offsetLabel(new Date(iso), RIYADH_TZ)})` : `${zone.replace(/_/g, " ")} (${offsetLabel(new Date(iso), zone)})`);

/** The visitor's own IANA zone when it differs from Riyadh's offset, else null. */
export function localZoneIfDifferent(at: Date = new Date()): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && offsetLabel(at, tz) !== offsetLabel(at, RIYADH_TZ) ? tz : null;
  } catch {
    return null;
  }
}

const STATUS: Record<BookingStatus, { label: string; tone: "good" | "warn" | "crit" | "muted" | "info" }> = {
  PENDING: { label: "Pending approval", tone: "warn" },
  CONFIRMED: { label: "Confirmed", tone: "good" },
  REJECTED: { label: "Declined", tone: "crit" },
  CANCELLED: { label: "Cancelled", tone: "crit" },
  COMPLETED: { label: "Completed", tone: "muted" },
  RESCHEDULED: { label: "Rescheduled", tone: "info" },
  RESCHEDULE_PROPOSED: { label: "New time proposed", tone: "info" },
  EXPIRED: { label: "Expired", tone: "muted" },
};

export const statusLabel = (s: BookingStatus) => STATUS[s].label;

export const OUTCOME_LABEL: Record<string, string> = {
  ATTENDED_BOTH: "Both attended",
  FOUNDER_NO_SHOW: "The startup didn't attend",
  ADVISOR_NO_SHOW: "The advisor didn't attend",
  BOTH_NO_SHOW: "Neither attended",
  NO_OVERLAP: "Both joined, but not together for long enough",
  UNKNOWN: "No attendance was recorded",
};
export const outcomeLabel = (o: string | null | undefined): string | null => (o ? OUTCOME_LABEL[o] ?? o : null);

/** "Expires October 28, 2026 · 04:00 PM" for a pending request, or null when there is nothing to show. */
export const expiryLine = (b: Pick<BookingView, "status" | "expiresAt">): string | null => (b.status === "PENDING" && b.expiresAt ? formatWhen(b.expiresAt) : null);

export function BookingStatusBadge({ booking }: { booking: Pick<BookingView, "status" | "pendingReschedule"> }) {
  const s = STATUS[booking.status];
  return (
    <span className="adv-badges">
      <span className={`badge adv-badge-${s.tone}`}>{s.label}</span>
      {booking.pendingReschedule && booking.status === "CONFIRMED" && <span className="badge adv-badge-info">New time proposed</span>}
    </span>
  );
}
