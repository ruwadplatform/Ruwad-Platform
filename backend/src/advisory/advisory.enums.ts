/** Advisory Services vocabulary, kept apart from common/enums.ts: nothing outside the advisory module needs it, and advisors deliberately have
 * no global UserRole — being an advisor is a property of an approved advisory profile, not of the account. */

export enum AdvisorStatus {
  DRAFT = "DRAFT",
  PENDING_REVIEW = "PENDING_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum ConsultationTypeId {
  SPECIALIST = "specialist",
  REVIEW = "review",
  ADVISORY = "advisory",
}

export enum BookingStatus {
  /** Requested by a founder, waiting for the advisor. Holds the slot. */
  PENDING = "PENDING",
  /** Approved by the advisor. Holds the slot. */
  CONFIRMED = "CONFIRMED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
  /** The original of a reschedule that both sides agreed to; its replacement is the live booking. Terminal. */
  RESCHEDULED = "RESCHEDULED",
  /** A proposed new time for a CONFIRMED booking, waiting for the OTHER party to accept. Holds the proposed slot while the original stays
   * CONFIRMED, so the original reservation is never lost while the parties agree. */
  RESCHEDULE_PROPOSED = "RESCHEDULE_PROPOSED",
}

/** Statuses that hold a time slot. Must match the WHERE clause of the exclusion constraint in the migration. */
export const SLOT_HOLDING_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.RESCHEDULE_PROPOSED];

/** Which side of a booking someone acts for. */
export type BookingParty = "FOUNDER" | "ADVISOR";
export type BookingActorRole = BookingParty | "ADMIN" | "SYSTEM";
