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

/** One weekly availability rule, in Riyadh time (UTC+3, no daylight saving). Weekday 0 = Sunday … 6 = Saturday. */
export interface WeeklyAvailability {
  weekday: number;
  /** "HH:MM" start times, 24-hour, Riyadh time. */
  times: string[];
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
