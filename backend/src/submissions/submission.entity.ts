import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind, SubmissionStatus } from "../common/enums";

/** A proposed new listing (or edit to an existing one), moving through
 * DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED/CHANGES_REQUESTED.
 * `payload` holds the proposed field values — applied to the real entity
 * only on approval (see SubmissionPublisherService), never written to the
 * public directory tables directly. `entityId` stays null for a brand-new
 * listing; this phase doesn't yet support submitting an edit to an
 * existing published entity. */
@Entity("submissions")
export class Submission extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: EntityKind })
  kind!: EntityKind;

  @Column({ type: "uuid", nullable: true })
  entityId?: string;

  @Column({ type: "jsonb", default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: "enum", enum: SubmissionStatus, default: SubmissionStatus.DRAFT })
  status!: SubmissionStatus;

  /** Denormalized display name (the org/entity name field out of `payload`)
   * so admin list/table queries don't need to parse JSONB just to show a
   * title — kept in sync on every payload update. */
  @Column({ nullable: true })
  title?: string;

  /** Latest reviewer-facing message — the full back-and-forth lives in
   * SubmissionReviewEvent; this is just "what does the user need to see
   * right now" for CHANGES_REQUESTED/REJECTED banners. */
  @Column({ type: "text", nullable: true })
  reviewerNote?: string;

  /** Which wizard step the user last had open — lets "Continue Editing"
   * resume exactly where they left off instead of always step 1. */
  @Column({ nullable: true })
  currentStep?: string;

  @Column({ type: "int", default: 0 })
  completionPercentage!: number;

  @Column({ type: "timestamptz", nullable: true })
  submittedAt?: Date;

  @Column({ type: "timestamptz", nullable: true })
  reviewStartedAt?: Date;

  @Column({ type: "timestamptz", nullable: true })
  reviewedAt?: Date;

  @Column({ type: "uuid", nullable: true })
  reviewedByUserId?: string;

  /** Set only on APPROVED — the real row this submission became, in the
   * entity's own table (startups/investors/hubs/research_institutions/
   * multinationals). Never left dangling: approval is one DB transaction
   * that sets this and flips status together, or rolls back entirely. */
  @Column({ type: "uuid", nullable: true })
  publishedEntityId?: string;

  @Column({ type: "int", default: 1 })
  version!: number;
}
