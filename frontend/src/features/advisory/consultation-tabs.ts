import type { BookingView } from "./advisory-types.ts";

/** Which tab(s) of My Consultations a booking belongs to. A booking can sit in more than one (a future confirmed booking is both Upcoming and
 * Confirmed). Pure, so it can be tested without the UI. */
export type ConsultationTab = "upcoming" | "pending" | "confirmed" | "completed" | "cancelled" | "rescheduled";

export const CONSULTATION_TABS: { id: ConsultationTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rescheduled", label: "Rescheduled" },
];

type Bucketable = Pick<BookingView, "status" | "startsAt" | "rescheduledFromId">;

export function inTab(b: Bucketable, tab: ConsultationTab, now: Date = new Date()): boolean {
  const future = new Date(b.startsAt) > now;
  switch (tab) {
    case "upcoming": return future && (b.status === "PENDING" || b.status === "CONFIRMED");
    case "pending": return b.status === "PENDING";
    case "confirmed": return b.status === "CONFIRMED";
    case "completed": return b.status === "COMPLETED";
    case "cancelled": return b.status === "CANCELLED" || b.status === "REJECTED" || b.status === "EXPIRED";
    case "rescheduled": return b.status === "RESCHEDULED" || b.rescheduledFromId !== null;
  }
}
