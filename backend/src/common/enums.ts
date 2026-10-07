/** Shared enums used across modules — kept in one place so the same
 * vocabulary (e.g. which entity types exist) can't drift between the
 * watchlist, introductions, memberships and documents modules. */

export enum EntityKind {
  STARTUP = "STARTUP",
  INVESTOR = "INVESTOR",
  HUB = "HUB",
  RESEARCH = "RESEARCH",
  MULTINATIONAL = "MULTINATIONAL",
}

/** Watchlist targets are a superset of EntityKind — a user can also save a
 * Report, which isn't one of the five polymorphic directory entities. */
export enum WatchlistKind {
  STARTUP = "STARTUP",
  INVESTOR = "INVESTOR",
  HUB = "HUB",
  RESEARCH = "RESEARCH",
  MULTINATIONAL = "MULTINATIONAL",
  REPORT = "REPORT",
}

export enum UserRole {
  USER = "USER",
  FOUNDER = "FOUNDER",
  INVESTOR = "INVESTOR",
  ORGANIZATION_ADMIN = "ORGANIZATION_ADMIN",
  RUWAD_ADMIN = "RUWAD_ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
}

export enum MembershipRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  EDITOR = "EDITOR",
  VIEWER = "VIEWER",
}

export enum IntroductionStatus {
  PENDING = "PENDING",
  IN_REVIEW = "IN_REVIEW",
  ACCEPTED = "ACCEPTED",
  DECLINED = "DECLINED",
  COMPLETED = "COMPLETED",
}

export enum SubmissionStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

/** Permanent audit trail for a submission's review lifecycle — survives
 * status changes, never overwritten (see SubmissionReviewEvent). */
export enum SubmissionEventType {
  DRAFT_CREATED = "DRAFT_CREATED",
  SUBMITTED = "SUBMITTED",
  REVIEW_STARTED = "REVIEW_STARTED",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
  RESUBMITTED = "RESUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum ListingStatus {
  PUBLISHED = "PUBLISHED",
  DRAFT = "DRAFT",
  UNDER_REVIEW = "UNDER_REVIEW",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
}

export enum ListingVisibility {
  PUBLIC = "PUBLIC",
  UNLISTED = "UNLISTED",
}

export enum DataRoomAccessStatus {
  LOCKED = "LOCKED",
  REQUESTED = "REQUESTED",
  NDA_REQUIRED = "NDA_REQUIRED",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

/** Whether a startup's RUWĀD Score is a real, current assessment or one of
 * the reasons it isn't — never a hidden 4th state, always shown to the
 * user as one of these (see ScoreCard.tsx). */
export enum ScoreStatus {
  NOT_CALCULATED = "NOT_CALCULATED",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  CALCULATED = "CALCULATED",
  STALE = "STALE",
  ERROR = "ERROR",
}

/** What caused a scoring run — recorded on every startup_score_history row
 * so "why did this change on this date" is always answerable. */
export enum ScoreTrigger {
  STARTUP_CREATED = "STARTUP_CREATED",
  STARTUP_UPDATED = "STARTUP_UPDATED",
  SUBMISSION_PUBLISHED = "SUBMISSION_PUBLISHED",
  PITCH_DECK_PROCESSED = "PITCH_DECK_PROCESSED",
  ADMIN_RECALCULATION = "ADMIN_RECALCULATION",
  ADMIN_OVERRIDE = "ADMIN_OVERRIDE",
  /** The existing-startup backfill (see scoring/existing-startup-backfill.service.ts). Unlike an admin recalculation it is NOT always
   * recorded: re-running it with unchanged data adds no history row. */
  BACKFILL = "BACKFILL",
}

/** Where one scoring-feature value came from — feeds confidence, never the
 * score itself. Mirrors the founder/admin/AI-extraction distinction the
 * submission system already makes, generalized for scoring inputs. */
export enum ScoreDataSource {
  FOUNDER_SUBMITTED = "FOUNDER_SUBMITTED",
  ADMIN_ENTERED = "ADMIN_ENTERED",
  PITCH_DECK_EXTRACTED = "PITCH_DECK_EXTRACTED",
  VERIFIED_DOCUMENT = "VERIFIED_DOCUMENT",
  EXTERNAL_SOURCE = "EXTERNAL_SOURCE",
  SYSTEM_DERIVED = "SYSTEM_DERIVED",
}

/** What kind of real-world thing happened to a startup after it was scored —
 * the raw material future ML labels are computed from (see backend/src/
 * ml-data/). Append-only, never inferred from silence: a startup with no
 * recent event is "no evidence yet", never assumed SHUTDOWN. */
export enum StartupOutcomeEventType {
  FUNDING_ROUND = "FUNDING_ROUND",
  REVENUE_UPDATE = "REVENUE_UPDATE",
  CUSTOMER_COUNT_UPDATE = "CUSTOMER_COUNT_UPDATE",
  ACTIVE_USERS_UPDATE = "ACTIVE_USERS_UPDATE",
  REGULATORY_MILESTONE = "REGULATORY_MILESTONE",
  REGULATORY_APPROVAL = "REGULATORY_APPROVAL",
  COMMERCIAL_LAUNCH = "COMMERCIAL_LAUNCH",
  PARTNERSHIP_SIGNED = "PARTNERSHIP_SIGNED",
  MARKET_ENTRY = "MARKET_ENTRY",
  TEAM_SIZE_UPDATE = "TEAM_SIZE_UPDATE",
  SHUTDOWN = "SHUTDOWN",
  ACQUISITION = "ACQUISITION",
  IPO = "IPO",
  OTHER = "OTHER",
}

/** Where an outcome event's facts came from — a claim being "entered" never
 * implies "verified"; those are two separate fields on the event. */
export enum OutcomeEventSource {
  FOUNDER_REPORTED = "FOUNDER_REPORTED",
  ADMIN_ENTERED = "ADMIN_ENTERED",
  VERIFIED_DOCUMENT = "VERIFIED_DOCUMENT",
  PUBLIC_SOURCE = "PUBLIC_SOURCE",
  SYSTEM_DERIVED = "SYSTEM_DERIVED",
}

/** Why a given startup_ml_feature_snapshots row exists — lets the coverage/
 * quality reports and the exporter distinguish a real point-in-time
 * observation from the one-time backfill snapshot that can only ever be
 * used as the START of a future observation window, never to fabricate a
 * label for a period before it existed. */
export enum MlSnapshotSource {
  MATERIAL_CHANGE = "MATERIAL_CHANGE",
  ADMIN_MANUAL = "ADMIN_MANUAL",
  BACKFILLED_CURRENT_STATE = "BACKFILLED_CURRENT_STATE",
  PUBLISHED = "PUBLISHED",
  /** Reconstructed from imported historical evidence (see ml-data/historical/)
   * — never "now," always some earlier snapshotAt the evidence actually
   * supports. Distinguished from BACKFILLED_CURRENT_STATE, which is always
   * dated "now" and can only start a future observation window. */
  HISTORICAL_RECONSTRUCTION = "HISTORICAL_RECONSTRUCTION",
}

/** WHY a historical snapshot's date was chosen — separate from
 * MlSnapshotSource (what kind of row it is). Lets later training exclude,
 * down-weight or separately evaluate snapshots whose date was picked with
 * knowledge of what happened next. Null = not yet declared (pre-existing
 * rows and live snapshots). Set at most once; never rewritten. */
export enum SnapshotSelectionMethod {
  /** June 30 / December 31, chosen without reference to any outcome. */
  FIXED_CALENDAR_GRID = "FIXED_CALENDAR_GRID",
  /** Date was positioned partly around a known outcome (the original
   * Cohort 1 snapshots) — may overstate positive rates. */
  LEGACY_OUTCOME_AWARE = "LEGACY_OUTCOME_AWARE",
  /** Another rule that was written down before the dates were chosen. */
  OTHER_PREDECLARED = "OTHER_PREDECLARED",
}

/** Whether a snapshot may feed REAL production training. Derived from how
 * its date was chosen (see SnapshotSelectionMethod): an outcome-aware
 * snapshot can never be ELIGIBLE, however it is later labelled. It stays in
 * the database for analysis, bias measurement and QA. Rows are never
 * deleted or rewritten because of this flag. */
export enum TrainingEligibility {
  ELIGIBLE = "ELIGIBLE",
  /** Kept for analysis/comparison; excluded from the default training export. */
  ANALYSIS_ONLY = "ANALYSIS_ONLY",
  /** Explicitly withdrawn by an admin (bad data, duplicate...). */
  EXCLUDED = "EXCLUDED",
}

/** What a startup (as of a date) says about whether a feature applies to it.
 * Only ever written by an explicit, reasoned declaration — never inferred
 * from a missing value. */
export enum FeatureApplicabilityStatus {
  APPLICABLE = "APPLICABLE",
  NOT_APPLICABLE = "NOT_APPLICABLE",
  UNKNOWN = "UNKNOWN",
}

/** How one core feature counts inside ONE snapshot's coverage:
 * the applicability declaration combined with whether a value exists. */
export enum FeatureCoverageState {
  APPLICABLE_WITH_VALUE = "APPLICABLE_WITH_VALUE",
  APPLICABLE_MISSING = "APPLICABLE_MISSING",
  NOT_APPLICABLE = "NOT_APPLICABLE",
  UNKNOWN = "UNKNOWN",
}

/** Outcome families an attestation can cover — one per group of label
 * targets, so coverage of one family can never mature another family's
 * negative labels (see ml-data/labels/outcome-coverage.ts). */
export enum OutcomeCoverageType {
  FUNDING = "FUNDING",
  REVENUE = "REVENUE",
  CUSTOMER = "CUSTOMER",
  REGULATORY = "REGULATORY",
  COMMERCIALIZATION = "COMMERCIALIZATION",
  PARTNERSHIP = "PARTNERSHIP",
  MARKET_ENTRY = "MARKET_ENTRY",
  SURVIVAL = "SURVIVAL",
}

/** Review state of a founder-supplied historical entry. Mirrors the
 * submissions workflow (SUBMITTED -> CHANGES_REQUESTED/APPROVED/REJECTED). */
export enum HistoricalReviewStatus {
  PENDING_REVIEW = "PENDING_REVIEW",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
}

/** What a historical entry contains — each maps to the existing evidence,
 * outcome-event, applicability, career or coverage tables on approval. */
export enum HistoricalSubmissionKind {
  REVENUE = "REVENUE",
  CUSTOMER_METRIC = "CUSTOMER_METRIC",
  TEAM_SIZE = "TEAM_SIZE",
  FOUNDER_CAREER = "FOUNDER_CAREER",
  REGULATORY_APPLICABILITY = "REGULATORY_APPLICABILITY",
  REGULATORY_MILESTONE = "REGULATORY_MILESTONE",
  FUNDING_ROUND = "FUNDING_ROUND",
  COVERAGE_ATTESTATION = "COVERAGE_ATTESTATION",
}

/** How an outcome-coverage attestation was established. */
export enum OutcomeCoverageMethod {
  ADMIN_RESEARCH = "ADMIN_RESEARCH",
  FOUNDER_ATTESTED = "FOUNDER_ATTESTED",
  LICENSED_DATABASE = "LICENSED_DATABASE",
  PUBLIC_SOURCES = "PUBLIC_SOURCES",
  OTHER = "OTHER",
}

/** Whether `startups.founded` is a stated year or only a bound. */
/** How a startup's RUWAD Score is calculated. EXISTING_DATA ("score what was provided"): scored on the information on file, with a factor that has
 * no data counted as 0, so the score rises as more information is added; Data Confidence shows how complete the information is. Used for the
 * directory startups AND for every newly submitted startup (product decision: a founder always gets a score for the data they provided, plus
 * guidance on what to add). This is now the only rule the scoring service applies, whatever a row's stored value says; the column and STANDARD
 * remain only so history and old rows stay readable. STANDARD was the stricter rule (at least 4 of 6 factors and 50% mean confidence). */
export enum ScoringBasis {
  STANDARD = "STANDARD",
  EXISTING_DATA = "EXISTING_DATA",
}

export enum FoundedYearBasis {
  KNOWN = "KNOWN",
  /** An upper-bound/placeholder (e.g. the earliest financing year). */
  ESTIMATED = "ESTIMATED",
  UNKNOWN = "UNKNOWN",
}

/** Every future ML label's maturity state — NOT_MATURED must never collapse
 * into a boolean false. See ml-data/labels/. */
export enum LabelStatus {
  NOT_MATURED = "NOT_MATURED",
  AVAILABLE = "AVAILABLE",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  UNVERIFIED = "UNVERIFIED",
  EXCLUDED = "EXCLUDED",
  /** The window has elapsed and no qualifying event is on file, but nobody
   * has attested that the relevant outcome family was checked through the
   * window's end — so silence is NOT a negative. */
  COVERAGE_UNATTESTED = "COVERAGE_UNATTESTED",
}

/** A model's lifecycle status — a NEW model row is always created as
 * `CANDIDATE` (or `TEST_ONLY` for a synthetic training run) and the write
 * layer never trusts a caller-supplied status for creation, only for the
 * explicit promotion endpoint (see MlModelRegistryService's transition
 * guard). `TEST_ONLY` is terminal: it can never become anything else,
 * structurally preventing a synthetic model from ever reaching `ACTIVE`. */
export enum MlModelStatus {
  TEST_ONLY = "TEST_ONLY",
  /** Trained on REAL data below the production readiness gate, for exploration
   * only. Terminal apart from RETIRED/REJECTED: it can never become CANDIDATE,
   * SHADOW or ACTIVE, and is never served shadow predictions. A production model
   * must be trained separately once Readiness V2 passes. */
  EXPERIMENTAL = "EXPERIMENTAL",
  CANDIDATE = "CANDIDATE",
  SHADOW = "SHADOW",
  ACTIVE = "ACTIVE",
  RETIRED = "RETIRED",
  REJECTED = "REJECTED",
}

/** One row per training attempt, including ones the readiness gate blocked
 * — so "why isn't there a model for X yet" is always answerable from the
 * audit trail, not just inferred from absence. */
export enum MlTrainingRunStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  BLOCKED_NOT_READY = "BLOCKED_NOT_READY",
}

/** What kind of value a shadow prediction is — a probability (classification
 * targets) is never on the same scale as a regression value, so a reader
 * must always check this before interpreting `ml_predictions.prediction`. */
export enum MlPredictionType {
  PROBABILITY = "PROBABILITY",
  REGRESSION_VALUE = "REGRESSION_VALUE",
}

// ---- Phase 3 — historical data acquisition & import (see ml-data/historical/) ----

/** Where one imported historical FACT came from — finer-grained than
 * OutcomeEventSource/ScoreDataSource because evidence quality here directly
 * drives conflict-resolution precedence (see HistoricalEvidenceService),
 * not just a confidence hint. */
export enum HistoricalEvidenceSourceType {
  FOUNDER_REPORTED = "FOUNDER_REPORTED",
  ADMIN_ENTERED = "ADMIN_ENTERED",
  VERIFIED_DOCUMENT = "VERIFIED_DOCUMENT",
  PUBLIC_COMPANY_SOURCE = "PUBLIC_COMPANY_SOURCE",
  PUBLIC_REGULATORY_SOURCE = "PUBLIC_REGULATORY_SOURCE",
  PUBLIC_NEWS_SOURCE = "PUBLIC_NEWS_SOURCE",
  LICENSED_DATABASE = "LICENSED_DATABASE",
  RESEARCH_DATABASE = "RESEARCH_DATABASE",
  PATENT_DATABASE = "PATENT_DATABASE",
  CLINICAL_TRIAL_REGISTRY = "CLINICAL_TRIAL_REGISTRY",
  SYSTEM_DERIVED = "SYSTEM_DERIVED",
}

/** Qualitative source-quality tier — not all sources are equally
 * trustworthy; this is what conflict resolution ranks on (see
 * HistoricalEvidenceService.record()'s doc comment for the exact
 * precedence order), never a raw numeric score nobody can audit. */
export enum SourceReliability {
  PRIMARY = "PRIMARY",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

/** Lifecycle of one evidence row once other evidence for the same
 * startup+field+period exists. Both sides of a conflict are always kept —
 * this status is the only thing that changes, never the value itself. */
export enum EvidenceStatus {
  NO_CONFLICT = "NO_CONFLICT",
  PREFERRED = "PREFERRED",
  CONFLICT = "CONFLICT",
  SUPERSEDED = "SUPERSEDED",
  REJECTED = "REJECTED",
}

export enum ImportBatchStatus {
  UPLOADED = "UPLOADED",
  VALIDATING = "VALIDATING",
  DRY_RUN_COMPLETE = "DRY_RUN_COMPLETE",
  IMPORTING = "IMPORTING",
  COMPLETED = "COMPLETED",
  PARTIAL = "PARTIAL",
  FAILED = "FAILED",
}

/** How a startup_external_identities row got its startupId — ranked in
 * this exact order by StartupIdentityMatchingService's match waterfall,
 * strongest first. FUZZY_REVIEW can never auto-set a startupId. */
export enum IdentityMatchedBy {
  EXTERNAL_ID = "EXTERNAL_ID",
  DOMAIN = "DOMAIN",
  ALIAS = "ALIAS",
  NORMALIZED_NAME = "NORMALIZED_NAME",
  FUZZY_REVIEW = "FUZZY_REVIEW",
  MANUAL = "MANUAL",
}

export enum IdentityMatchStatus {
  MATCHED = "MATCHED",
  UNMATCHED = "UNMATCHED",
  POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
}

/** Which real table a parsed CSV row ultimately becomes a row in — FEATURE
 * goes to startup_historical_evidence, OUTCOME_EVENT reuses the existing
 * startup_outcome_events (never a competing model, see Phase 1C), IDENTITY
 * goes to startup_external_identities. */
export enum HistoricalRecordType {
  FEATURE = "FEATURE",
  OUTCOME_EVENT = "OUTCOME_EVENT",
  IDENTITY = "IDENTITY",
}

export enum ActivityType {
  WATCHLIST_ADD = "watchlist_add",
  WATCHLIST_REMOVE = "watchlist_remove",
  SEARCH_SAVED = "search_saved",
  INTRO_SUBMITTED = "intro_submitted",
  LISTING_EDITED = "listing_edited",
  PROFILE_UPDATED = "profile_updated",
  SUBMISSION_SENT = "submission_sent",
  SUBMISSION_CHANGES_REQUESTED = "submission_changes_requested",
  SUBMISSION_RESUBMITTED = "submission_resubmitted",
  SUBMISSION_APPROVED = "submission_approved",
  SUBMISSION_REJECTED = "submission_rejected",
}
