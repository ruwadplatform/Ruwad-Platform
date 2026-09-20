import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** One row per news/events collection run — lets the scheduler know when a
 * kind last succeeded (so a sleeping host catches up when it wakes) and gives
 * a safe, key-free audit trail. */
@Entity("content_sync_runs")
export class ContentSyncRun extends BaseEntity {
  @Index()
  @Column() kind!: string; // "news" | "events"
  @Column() status!: string; // "ok" | "partial" | "failed" | "skipped"
  @Column({ type: "timestamptz" }) startedAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) finishedAt?: Date | null;
  @Column({ type: "int", default: 0 }) fetched!: number;
  @Column({ type: "int", default: 0 }) saved!: number;
  @Column({ type: "int", default: 0 }) updated!: number;
  @Column({ type: "int", default: 0 }) skipped!: number;
  /** Short, provider-agnostic note — never a raw provider response or a key. */
  @Column({ type: "text", nullable: true }) message?: string | null;
}
