import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import type { FeatureProvenance, ScoringFeatures } from "./scoring.types";

/** Current-state structured scoring inputs for one startup — one row per
 * startup (mirrors Contact's one-to-one pattern), overwritten in place as
 * new information arrives, unlike startup_score_history which never is.
 * `features` is a flat jsonb bag rather than ~40 narrow columns, matching
 * this codebase's existing rule for flexible, non-relationally-queried data
 * (see Startup.traction/newsItems, Report.libraryContent). `provenance` is
 * a parallel object keyed the same way, so every value can answer "where
 * did this come from, and do we trust it". */
@Entity("startup_scoring_features")
export class StartupScoringFeatures extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "uuid" })
  startupId!: string;

  @Column({ type: "jsonb", default: {} })
  features!: ScoringFeatures;

  @Column({ type: "jsonb", default: {} })
  provenance!: FeatureProvenance;
}
