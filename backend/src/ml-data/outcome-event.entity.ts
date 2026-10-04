import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { OutcomeEventSource, StartupOutcomeEventType } from "../common/enums";
import { numericTransformer } from "../common/numeric.transformer";

/** Append-only record of something that actually happened to a startup
 * after it was scored — the raw material future ML labels are computed
 * from (see ml-data/labels/). Mirrors the same append-only, uuid-target-id
 * + enum-type + optional-actor shape as submission_review_events and
 * startup_score_history — rows are never updated or deleted, only added. */
@Entity("startup_outcome_events")
export class StartupOutcomeEvent extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  startupId!: string;

  @Column({ type: "enum", enum: StartupOutcomeEventType })
  eventType!: StartupOutcomeEventType;

  /** The date the outcome actually occurred, not when it was entered —
   * admin-entered and can be in the past. Every label/window calculation
   * keys off this, never createdAt. */
  @Column({ type: "date" })
  eventDate!: string;

  @Column({ type: "numeric", precision: 14, scale: 2, nullable: true, transformer: numericTransformer })
  valueNumeric?: number;

  /** Free text: a regulatory milestone label, a country name for
   * MARKET_ENTRY, a round name, etc. — meaning depends on eventType. */
  @Column({ nullable: true })
  valueText?: string;

  @Column({ type: "enum", enum: OutcomeEventSource })
  source!: OutcomeEventSource;

  /** Entered is not the same as verified — this is a separate, explicit
   * flag an admin sets, never implied by source alone. */
  @Column({ default: false })
  verified!: boolean;

  @Column({ type: "uuid", nullable: true })
  sourceDocumentId?: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ type: "text", nullable: true })
  notes?: string;

  /** Null for SYSTEM_DERIVED events — nobody "entered" those. */
  @Column({ type: "uuid", nullable: true })
  createdByUserId?: string;

  /** Set only for events written by the historical-import pipeline (see
   * ml-data/historical/) — null for every event created the normal way. */
  @Index()
  @Column({ type: "uuid", nullable: true })
  importBatchId?: string;

  /** When the source reporting this event was published — distinct from
   * eventDate (when the outcome actually happened). A 2024 article can
   * report an event that happened in 2023; both dates are preserved. */
  @Column({ type: "date", nullable: true })
  publishedAt?: string;
}
