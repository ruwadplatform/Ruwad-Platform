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
  /** The soonest slot actually open to book, worked out by the server (bookings, time off and notice already excluded). Null when none. */
  nextAvailable: { startsAt: string; minutes: number } | null;
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

export type BookingStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "RESCHEDULED" | "RESCHEDULE_PROPOSED" | "EXPIRED";
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
  pendingReschedule: { id: string; startsAt: string; endsAt: string; proposedBy: BookingParty; expiresAt: string | null } | null;
  /** For a PENDING request: when it expires if nobody answers. */
  expiresAt: string | null;
  /** The consultation has ended and a person still has to say what happened (the Needs Review queue). */
  needsReview: boolean;
  /** What attendance showed or a person recorded: ATTENDED_BOTH, FOUNDER_NO_SHOW, ADVISOR_NO_SHOW, BOTH_NO_SHOW, NO_OVERLAP, UNKNOWN. */
  attendanceOutcome: string | null;
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

export interface AutomationStatus {
  schedulerEnabled: boolean;
  running: boolean;
  tickSeconds: number;
  requestExpiryHours: number;
  cutoffMinutes: number;
  expiryWarningHours: number;
  reminderHours: number[];
  autoComplete: boolean;
  lastReport: AutomationReport | null;
  lastError: string | null;
}

export interface AutomationReport {
  ranAt: string;
  dryRun: boolean;
  expired: number;
  proposalsExpired: number;
  expiryWarnings: number;
  reminders24h: number;
  reminders1h: number;
  references: string[];
}

// ---- Phase 4: video meetings ---------------------------------------------------------------------------------------------------------------------

export type MeetingState = "NOT_CONFIRMED" | "NOT_OPEN" | "OPEN" | "ENDED";

export interface MeetingStatus {
  state: MeetingState;
  opensAt: string;
  closesAt: string;
  /** "simulated": a pretend room (local work and demonstration bookings). "daily": a real Daily room. */
  mode: "daily" | "simulated";
  /** False when real video was requested but isn't set up yet. */
  available: boolean;
  /** The caller may join right now (advisor, or a startup owner/admin, inside the join window). */
  canJoin: boolean;
  recording: false;
  notice: string;
  /** Who has been in the room, and who is in it now. */
  attendance: AttendanceSummary;
}

export interface RoleAttendance {
  hasRecord: boolean;
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  minutes: number;
  present: boolean;
}

export interface AttendanceSummary {
  founder: RoleAttendance;
  advisor: RoleAttendance;
  overlapMinutes: number;
  hasData: boolean;
}

/** What a person can record about a consultation that has ended. (There is deliberately no NO_SHOW status: the booking becomes COMPLETED with this outcome.) */
export type ManualOutcome = "ATTENDED_BOTH" | "FOUNDER_NO_SHOW" | "ADVISOR_NO_SHOW" | "BOTH_NO_SHOW";

export interface JoinInfo {
  mode: "daily" | "simulated";
  roomUrl: string | null;
  token: string;
  userName: string;
  opensAt: string;
  closesAt: string;
  tokenExpiresAt: string;
  recording: false;
  notice: string;
}
