import { Injectable, NotFoundException } from "@nestjs/common";
import { getTarget } from "./labels/target-registry";
import { ML_FEATURES_V1 } from "./ml-data.constants";
import { LabelStatus, TrainingEligibility } from "../common/enums";
import { MlTrainingDataService } from "./ml-training-data.service";

export interface ExportOptions {
  targetName: string;
  /** Only rows whose snapshot confidence meets this bar. */
  minConfidence?: number;
  /** When true, an unverified feature value is blanked out rather than the
   * whole row being dropped — "verified features only" is a per-feature
   * guarantee, not a per-row filter. */
  verifiedOnly?: boolean;
  /** Defaults true — set false for the "pure model matrix" mode with no
   * startupId/snapshotId columns. */
  includeIdentifiers?: boolean;
  /** Defaults false — the clean, eligible-only export never mixes immature
   * labels with confirmed negatives unless explicitly asked for (audit/
   * debugging use only). */
  includeImmature?: boolean;
  /** Defaults false. ANALYSIS_ONLY snapshots (e.g. LEGACY_OUTCOME_AWARE) are
   * kept out of the production training export; an admin may ask for them
   * for analysis, in which case every row says what it is in the
   * `trainingEligibility` column. Never set by the training CLI. */
  includeAnalysisOnly?: boolean;
  /** Defaults false. Explicitly EXCLUDED snapshots. */
  includeExcluded?: boolean;
}

export type ExportRow = Record<string, unknown>;

/** Admin-only, target-specific, leakage-safe dataset export. Reads ONLY
 * from startup_ml_feature_snapshots (the frozen historical record) — never
 * substitutes a startup's current live state, which is what makes this
 * structurally leakage-safe rather than leakage-safe-by-convention. Every
 * feature column comes from the ML_FEATURES_V1 allowlist (never
 * ruwadScore/factorScores, which were never part of ScoringFeatures to
 * begin with — nothing to filter out because they were never captured).
 *
 * By DEFAULT it returns only training-ELIGIBLE snapshots with defensible
 * labels: an outcome-aware (legacy) snapshot cannot silently enter a
 * production training set, and a "negative" only exists where the outcome
 * family was attested through the window (labels come from
 * MlTrainingDataService in V2 mode). */
@Injectable()
export class MlDatasetExportService {
  constructor(private readonly training: MlTrainingDataService) {}

  async exportForTarget(opts: ExportOptions, now: Date = new Date()): Promise<ExportRow[]> {
    const target = getTarget(opts.targetName);
    if (!target) throw new NotFoundException(`Unknown ML target "${opts.targetName}"`);

    const world = await this.training.loadWorld();
    const evaluated = this.training.evaluate(world, target, now, "V2", "ALL");

    const rows: ExportRow[] = [];
    for (const { snapshot: s, eligibility, label } of evaluated) {
      if (eligibility === TrainingEligibility.ANALYSIS_ONLY && !opts.includeAnalysisOnly) continue;
      if (eligibility === TrainingEligibility.EXCLUDED && !opts.includeExcluded) continue;
      if (opts.minConfidence != null && (s.dataConfidence == null || Number(s.dataConfidence) < opts.minConfidence)) continue;
      if (!opts.includeImmature && label.status !== LabelStatus.AVAILABLE) continue;

      const row: ExportRow = {};
      if (opts.includeIdentifiers !== false) { row.startupId = s.startupId; row.snapshotId = s.id; }
      row.snapshotAt = s.snapshotAt.toISOString();
      row.category = s.category;
      row.startupStage = s.startupStage;
      row.featureSchemaVersion = s.featureSchemaVersion;
      // How the snapshot date was chosen, and whether it may be trained on — lets training exclude, down-weight or separately evaluate outcome-aware (legacy) rows.
      row.snapshotSource = s.snapshotSource;
      row.snapshotSelectionMethod = s.selectionMethod ?? "UNDECLARED";
      row.trainingEligibility = eligibility;

      for (const key of ML_FEATURES_V1) {
        const verified = !!s.provenanceSummary[key]?.verified;
        row[key] = opts.verifiedOnly && !verified ? undefined : (s.features[key] ?? undefined);
      }

      row[`target_${target.name}`] = target.valueType === "boolean" ? label.valueBoolean : label.valueNumeric;
      row[`target_${target.name}_status`] = label.status;
      row.targetVersion = target.targetVersion;
      rows.push(row);
    }
    return rows;
  }
}

/** Hand-rolled RFC4180-ish CSV — no CSV library exists anywhere in this
 * monorepo, matching its zero-unnecessary-dependency convention. */
export function rowsToCsv(rows: ExportRow[]): string {
  if (!rows.length) return "";
  const columns = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const escape = (v: unknown): string => {
    if (v === undefined || v === null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => escape(r[c])).join(","))];
  return lines.join("\r\n");
}
