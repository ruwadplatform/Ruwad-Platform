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
