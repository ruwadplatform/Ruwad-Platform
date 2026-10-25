/** Advisory Services — shapes shared by the directory, the (later) profile page and the (later) booking flow.
 *
 * `AdvisorSummary` is deliberately the shape the backend will return for the directory, so replacing the demonstration seed with real,
 * verified advisors is a change in `lib/api/advisory.ts` only — not in the screens. */

/** The kinds of consultation an advisor can offer. Each has a fixed duration in this first release. */
export type ConsultationTypeId = "specialist" | "review" | "advisory";

export interface ConsultationType {
  id: ConsultationTypeId;
  label: string;
  minutes: number;
}

export const CONSULTATION_TYPES: ConsultationType[] = [
  { id: "specialist", label: "Specialist Consultation", minutes: 30 },
  { id: "review", label: "Research Project Review", minutes: 45 },
  { id: "advisory", label: "Technical Advisory", minutes: 60 },
];

/** A stretch of the day an advisor is open for consultations, "HH:MM" 24-hour, Riyadh time. A consultation must fit inside one window. */
export interface AvailabilityWindow {
  start: string;
  end: string;
}

/** One weekly availability rule, in Riyadh time (UTC+3, no daylight saving). Weekday 0 = Sunday … 6 = Saturday. */
export interface WeeklyAvailability {
  weekday: number;
  windows: AvailabilityWindow[];
}

export interface AdvisorSummary {
  /** Stable URL id (`/discover/advisory-services/<id>`). */
  id: string;
  name: string;
  /** The institution as shown on the card (e.g. "KACST"). */
  institution: string;
  /** The full institution name, searchable but not shown on the card. */
  institutionFull: string;
  /** The advisor's own claim of affiliation. It is never shown as verified unless `affiliationVerified` is true (set by an admin). */
  affiliationVerified: boolean;
  specialization: string;
  /** One short line shown on the card. */
  expertise: string;
  /** Extra search terms for the advisor's expertise. */
  expertiseTags: string[];
  yearsExperience: number | null;
  consultationTypes: ConsultationTypeId[];
  availability: WeeklyAvailability[];
  /** True for the fictional demonstration profiles. They are always labelled as such in the UI. */
  isDemo: boolean;
}

export type AvailabilityFilter = "any" | "today" | "week" | "twoWeeks";
export type SortMode = "relevance" | "experience";
export type ViewMode = "grid" | "list";

export interface AdvisorFilters {
  query: string;
  specialization: string;
  institution: string;
  consultationType: "" | ConsultationTypeId;
  availability: AvailabilityFilter;
}

export const EMPTY_ADVISOR_FILTERS: AdvisorFilters = { query: "", specialization: "", institution: "", consultationType: "", availability: "any" };

/** One consultation an advisor offers: a kind of consultation (which the directory filter uses) with its own name, description and length. */
export interface AdvisorService {
  id: string;
  typeId: ConsultationTypeId;
  name: string;
  description: string;
  minutes: number;
}

/** A publication an advisor has listed. Empty for demonstration advisors: none are invented. */
export interface Publication {
  title: string;
  venue: string;
  year: number;
  url?: string;
}

/** A review of a completed consultation. Empty until real consultations exist: none are invented. */
export interface AdvisorReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
}

/** Everything the profile page shows: the directory summary plus the detail. */
export interface AdvisorProfile extends AdvisorSummary {
  designation: string;
  location: string;
  about: string;
  /** Specializations the advisor lists (the first is the main one shown in the directory). */
  specializations: string[];
  researchAreas: string[];
  services: AdvisorService[];
  publications: Publication[];
  reviews: AdvisorReview[];
}

// ---- Phase 3: bookings (the backend's shapes) ----------------------------------------------------------------------------------------------------

export type BookingStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "RESCHEDULED" | "RESCHEDULE_PROPOSED";
export type BookingParty = "FOUNDER" | "ADVISOR";

export interface BookingView {
  id: string;
  reference: string;
  status: BookingStatus;
  /** ISO-8601 instants (UTC). Shown in Riyadh time and, where it differs, the viewer's own zone. */
  startsAt: string;
  endsAt: string;
  minutes: number;
  serviceId: string;
  serviceName: string;
  serviceTypeId: string;
  startupId: string;
  startupName: string;
  description: string | null;
  isDemo: boolean;
  advisor: { id: string; slug: string; name: string; institution: string } | null;
  requester: { name: string } | null;
  decisionNote: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  rescheduledFromId: string | null;
  /** A proposed new time waiting for the other party. The booking stays CONFIRMED at its original time until it is accepted. */
  pendingReschedule: { id: string; startsAt: string; endsAt: string; proposedBy: BookingParty } | null;
}

export interface BookingActions {
  approve: boolean;
  reject: boolean;
  cancel: boolean;
  complete: boolean;
  proposeReschedule: boolean;
  acceptReschedule: boolean;
  declineReschedule: boolean;
  withdrawReschedule: boolean;
}

export interface BookingHistoryEvent {
  id: string;
  type: string;
  actorRole: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface BookingDetail {
  booking: BookingView;
  viewerRole: "FOUNDER" | "ADVISOR" | "ADMIN";
  actions: BookingActions;
  history: BookingHistoryEvent[];
}

export interface BookableStartup { id: string; name: string; role: string }
export interface SlotOffer { time: string; startsAt: string; endsAt: string }

export type AdvisorReviewStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

/** The signed-in person's own advisor profile, with its review status. */
export interface MyAdvisorProfile {
  status: AdvisorReviewStatus;
  reviewNotes: string | null;
  affiliationVerified: boolean;
  profile: AdvisorProfile & { services: (AdvisorService & { active?: boolean })[] };
}

export interface AvailabilityState {
  timeZone: string;
  windows: { id: string; weekday: number; startTime: string; endTime: string }[];
  timeOff: { id: string; date: string; startTime: string | null; endTime: string | null; reason: string | null }[];
}

export interface AdvisorApplication {
  name: string;
  institution: string;
  institutionFull: string;
  designation: string;
  location: string;
  specialization: string;
  specializations: string[];
  researchAreas: string[];
  expertise: string;
  about: string;
  yearsExperience?: number;
}

export interface AdminAdvisorRow {
  id: string;
  slug: string;
  name: string;
  institution: string;
  institutionFull: string;
  designation: string;
  location: string;
  specialization: string;
  expertise: string;
  about: string;
  yearsExperience: number | null;
  status: AdvisorReviewStatus;
  isDemo: boolean;
  affiliationVerified: boolean;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  applicant: { name: string; email: string } | null;
}

export interface AdvisoryStats {
  includesDemo: boolean;
  generatedAt: string;
  bookings: { total: number; last30Days: number; upcomingConfirmed: number; byStatus: Record<string, number> };
  advisors: { byStatus: Record<string, number> };
  topAdvisors: { id: string; name: string; isDemo: boolean; bookings: number }[];
}
