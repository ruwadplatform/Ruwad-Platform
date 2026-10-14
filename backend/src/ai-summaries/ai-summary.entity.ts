import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** One cached AI summary per (entity, access scope). A row is reused only while its `sourceFingerprint` still matches a hash of the
 * entity's current source data — editing the profile changes the hash, so the next request regenerates instead of serving stale text. */
@Entity("ai_summaries")
@Index("UQ_ai_summaries_entity_scope", ["entityType", "entityId", "accessScope"], { unique: true })
export class AiSummary extends BaseEntity {
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Column({ type: "uuid" })
  entityId!: string;

  /** Which audience the source data was filtered for. Only "member" (a signed-in user) exists today; a different scope gets its own row. */
  @Column({ type: "varchar", default: "member" })
  accessScope!: string;

  @Column({ type: "text" })
  overview!: string;

  @Column({ type: "jsonb", default: [] })
  highlights!: string[];

  @Column({ type: "varchar" })
  modelVersion!: string;

  @Column({ type: "varchar" })
  promptVersion!: string;

  @Column({ type: "varchar" })
  sourceFingerprint!: string;

  @Column({ type: "timestamptz" })
  generatedAt!: Date;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "varchar", default: "READY" })
  status!: "READY";
}
