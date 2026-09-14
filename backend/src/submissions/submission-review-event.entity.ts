import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { SubmissionEventType } from "../common/enums";

/** Append-only audit trail for one submission's review lifecycle — never
 * updated or deleted, so admin feedback (and the fact review happened at
 * all) survives every later status change. Queried by submissionId to
 * render "Review History" on both the user's and the admin's detail view. */
@Entity("submission_review_events")
export class SubmissionReviewEvent extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  submissionId!: string;

  @Column({ type: "enum", enum: SubmissionEventType })
  eventType!: SubmissionEventType;

  @Column({ type: "uuid", nullable: true })
  actorUserId?: string;

  @Column({ type: "text", nullable: true })
  message?: string;

  /** Optional section name for section-specific "please fix Funding" style
   * feedback (see REQUEST_CHANGES). Null for whole-submission events. */
  @Column({ nullable: true })
  section?: string;
}
