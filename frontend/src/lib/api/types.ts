/** Shapes returned by the real backend — trimmed to the fields the
 * frontend actually reads, not a 1:1 copy of the backend entities. */

export type UserRole = "USER" | "FOUNDER" | "INVESTOR" | "ORGANIZATION_ADMIN" | "RUWAD_ADMIN" | "SUPER_ADMIN";

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  organization: string | null;
  organizationWebsite: string | null;
  organizationStage: string | null;
  organizationCategory: string | null;
  organizationCity: string | null;
  organizationType: string | null;
  country: string | null;
  city: string | null;
  bio: string | null;
  linkedin: string | null;
  profileImageId: string | null;
  interests: string[];
  role: UserRole;
  createdAt: string;
}

export interface ApiSettings {
  emailNotifications: boolean;
  introRequestAlerts: boolean;
  savedSearchAlerts: boolean;
  weeklyDigest: boolean;
  profileVisibleToGuests: boolean;
  showContactInfo: boolean;
}

export type ApiWatchlistKind = "STARTUP" | "INVESTOR" | "HUB" | "RESEARCH" | "MULTINATIONAL" | "REPORT";

export interface ApiWatchlistEntry {
  kind: ApiWatchlistKind;
  entityId: string;
  slug: string | null;
}

export interface ApiSavedSearch {
  id: string;
  entityType: string;
  label: string;
  search: string;
  filters: Record<string, string[]>;
  resultCountAtSave: number;
  createdAt: string;
  lastRunAt: string | null;
  alertEnabled: boolean;
}

export interface ApiIntroduction {
  id: string;
  status: "PENDING" | "IN_REVIEW" | "ACCEPTED" | "DECLINED" | "COMPLETED";
  investor: string | null;
  startup: string | null;
  reasonType: string | null;
  reason: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory: { status: string; date: string }[];
}

export interface ApiActivity {
  id: string;
  type: string;
  text: string;
  route: string | null;
  createdAt: string;
}

export interface ApiOwnedListing {
  membershipId: string;
  kind: ApiWatchlistKind;
  entityId: string;
  name: string;
  slug: string;
  listingStatus: string;
  listingVisibility: string;
  views: number;
  lastUpdated: string;
}

export interface ApiEcosystemSnapshot {
  trackedFundingSar: number;
  startupCount: number;
  topCategory: { name: string; count: number } | null;
  activeInvestors: number;
  hubsCount: number;
  openHubsCount: number;
  researchCount: number;
  multinationalsCount: number;
}

export type ApiSubmissionKind = "STARTUP" | "INVESTOR" | "HUB" | "RESEARCH" | "MULTINATIONAL";
export type ApiSubmissionStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";

export interface ApiSubmission {
  id: string;
  userId: string;
  kind: ApiSubmissionKind;
  entityId: string | null;
  payload: Record<string, unknown>;
  status: ApiSubmissionStatus;
  title: string | null;
  reviewerNote: string | null;
  currentStep: string | null;
  completionPercentage: number;
  submittedAt: string | null;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  publishedEntityId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSubmissionReviewEvent {
  id: string;
  submissionId: string;
  eventType: "DRAFT_CREATED" | "SUBMITTED" | "REVIEW_STARTED" | "CHANGES_REQUESTED" | "RESUBMITTED" | "APPROVED" | "REJECTED";
  actorUserId: string | null;
  message: string | null;
  section: string | null;
  createdAt: string;
}

export interface ApiSubmissionKpis {
  total: number;
  DRAFT: number;
  SUBMITTED: number;
  UNDER_REVIEW: number;
  CHANGES_REQUESTED: number;
  APPROVED: number;
  REJECTED: number;
}
