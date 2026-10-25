import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { AdvisorStatus, BookingStatus, ConsultationTypeId } from "./advisory.enums";

/** An advisor's profile. `userId` is the RUWĀD account that manages it — null for the fictional demonstration advisors, which nobody can log in as.
 * Advisor access is derived from this row (status APPROVED + userId = the caller); there is no advisor UserRole. Nothing here claims a verified
 * university affiliation: `affiliationVerified` is only ever set by an administrator. */
@Entity("advisory_advisors")
export class AdvisoryAdvisor extends BaseEntity {
  @Index({ unique: true, where: `"userId" IS NOT NULL` })
  @Column({ type: "uuid", nullable: true })
  userId!: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 80 })
  slug!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 160 })
  institution!: string;

  @Column({ type: "varchar", length: 200 })
  institutionFull!: string;

  @Column({ type: "varchar", length: 120 })
  designation!: string;

  @Column({ type: "varchar", length: 120 })
  location!: string;

  @Column({ type: "varchar", length: 120 })
  specialization!: string;

  @Column({ type: "text", array: true, default: () => "'{}'" })
  specializations!: string[];

  @Column({ type: "text", array: true, default: () => "'{}'" })
  researchAreas!: string[];

  @Column({ type: "varchar", length: 300 })
  expertise!: string;

  @Column({ type: "text", array: true, default: () => "'{}'" })
  expertiseTags!: string[];

  @Column({ type: "text" })
  about!: string;

  @Column({ type: "int", nullable: true })
  yearsExperience!: number | null;

  @Column({ type: "boolean", default: false })
  affiliationVerified!: boolean;

  /** A fictional demonstration profile. Its bookings are demonstrations too: never emailed, left out of statistics by default. */
  @Column({ type: "boolean", default: false })
  isDemo!: boolean;

  @Index()
  @Column({ type: "enum", enum: AdvisorStatus, default: AdvisorStatus.PENDING_REVIEW })
  status!: AdvisorStatus;

  @Column({ type: "uuid", nullable: true })
  reviewedByUserId!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  reviewNotes!: string | null;
}

/** One consultation an advisor offers. */
@Entity("advisory_services")
export class AdvisoryService extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  advisorId!: string;

  @Column({ type: "enum", enum: ConsultationTypeId })
  typeId!: ConsultationTypeId;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 400 })
  description!: string;

  @Column({ type: "int" })
  minutes!: number;

  /** Deactivated rather than deleted, so past bookings keep a service to point at. */
  @Column({ type: "boolean", default: true })
  active!: boolean;
}

/** A weekly window the advisor is open, in Riyadh time (UTC+3, no DST). Several rows per weekday make several windows. */
@Entity("advisory_availability_rules")
@Index(["advisorId", "weekday", "startTime"], { unique: true })
export class AdvisoryAvailabilityRule extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  advisorId!: string;

  /** 0 = Sunday … 6 = Saturday. */
  @Column({ type: "smallint" })
  weekday!: number;

  /** "HH:MM", Riyadh time. */
  @Column({ type: "varchar", length: 5 })
  startTime!: string;

  @Column({ type: "varchar", length: 5 })
  endTime!: string;
}

/** Time off: a whole Riyadh calendar day (no times) or a stretch of one. */
@Entity("advisory_availability_exceptions")
export class AdvisoryAvailabilityException extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  advisorId!: string;

  /** "YYYY-MM-DD", Riyadh calendar date. */
  @Column({ type: "date" })
  date!: string;

  @Column({ type: "varchar", length: 5, nullable: true })
  startTime!: string | null;

  @Column({ type: "varchar", length: 5, nullable: true })
  endTime!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  reason!: string | null;
}

/** A consultation booking. The database itself refuses two slot-holding bookings that overlap for one advisor (exclusion constraint in the
 * migration), except within one `groupId`: a reschedule proposal shares the original's groupId so the two may overlap while both are held. */
@Entity("advisory_bookings")
export class AdvisoryBooking extends BaseEntity {
  /** Short human reference shown to both sides, e.g. "ADV-7K2M9Q". */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 16 })
  reference!: string;

  @Column({ type: "uuid" })
  groupId!: string;

  @Index()
  @Column({ type: "uuid" })
  advisorId!: string;

  @Column({ type: "uuid" })
  serviceId!: string;

  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Index()
  @Column({ type: "uuid" })
  requestedByUserId!: string;

  @Column({ type: "timestamptz" })
  startsAt!: Date;

  @Column({ type: "timestamptz" })
  endsAt!: Date;

  @Column({ type: "int" })
  minutes!: number;

  /** Snapshots, so history stays readable if the service or startup is later renamed. */
  @Column({ type: "varchar", length: 120 })
  serviceName!: string;

  @Column({ type: "varchar", length: 20 })
  serviceTypeId!: string;

  @Column({ type: "varchar", length: 200 })
  startupName!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: "enum", enum: BookingStatus, default: BookingStatus.PENDING })
  status!: BookingStatus;

  /** Set on a reschedule proposal (and kept on the replacement once accepted): the booking it would replace. */
  @Column({ type: "uuid", nullable: true })
  rescheduledFromId!: string | null;

  /** Who proposed the new time; the OTHER party has to accept it. */
  @Column({ type: "varchar", length: 10, nullable: true })
  proposedBy!: "FOUNDER" | "ADVISOR" | null;

  @Column({ type: "text", nullable: true })
  decisionNote!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  decidedAt!: Date | null;

  @Column({ type: "varchar", length: 10, nullable: true })
  cancelledBy!: "FOUNDER" | "ADVISOR" | "ADMIN" | null;

  @Column({ type: "text", nullable: true })
  cancelReason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @Index()
  @Column({ type: "boolean", default: false })
  isDemo!: boolean;
}

/** Append-only audit trail: one row per thing that happened to a booking. Never updated or deleted. */
@Entity("advisory_booking_events")
export class AdvisoryBookingEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  bookingId!: string;

  /** Null for system events (e.g. a mocked notification). */
  @Column({ type: "uuid", nullable: true })
  actorUserId!: string | null;

  @Column({ type: "varchar", length: 10 })
  actorRole!: string;

  /** CREATED, CONFIRMED, REJECTED, CANCELLED, COMPLETED, RESCHEDULE_PROPOSED, RESCHEDULE_ACCEPTED, RESCHEDULE_DECLINED, RESCHEDULE_WITHDRAWN,
   * RESCHEDULED, NOTIFICATION. */
  @Column({ type: "varchar", length: 30 })
  type!: string;

  @Column({ type: "varchar", length: 24, nullable: true })
  fromStatus!: string | null;

  @Column({ type: "varchar", length: 24, nullable: true })
  toStatus!: string | null;

  @Column({ type: "jsonb", nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
