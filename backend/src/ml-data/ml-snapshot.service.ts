import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";
import { Startup } from "../startups/startup.entity";
import { StartupScoringFeatures } from "../scoring/startup-scoring-features.entity";
import { StartupScoreHistory } from "../scoring/startup-score-history.entity";
import { MlSnapshotSource, ScoreStatus, SnapshotSelectionMethod } from "../common/enums";
import { ML_FEATURE_SCHEMA_VERSION } from "./ml-data.constants";
import { defaultEligibilityFor } from "./training-eligibility";
import type { ScoringFeatures, FeatureProvenance, ScoreResult } from "../scoring/scoring.types";
import { FACTOR_KEYS } from "../scoring/scoring.types";

/** Creates a new, immutable startup_ml_feature_snapshots row only when the
 * startup's scoring inputs have materially changed since the last one —
 * called from ScoringService.recalculateStartupScore() (the one place that
 * already has the freshly-computed features/provenance/result in hand on
 * every path that can change them: publish, admin edit, verify,
 * recalculate). A cosmetic edit (logo, description wording) never touches
 * ScoringFeatures, so it never reaches this service at all — there's
 * nothing to diff, so no snapshot, with no separate "is this field
 * material" list to maintain.
 *
 * Deliberately does NOT depend on ScoringService itself (only on the same
 * entities ScoringService also reads) — that keeps ScoringModule ->
 * MlDataModule a one-directional import, with no circular module
 * dependency for the admin-triggered manual-snapshot/backfill actions
 * exposed here. */
@Injectable()
export class MlSnapshotService {
  private readonly logger = new Logger(MlSnapshotService.name);

  constructor(
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshots: Repository<StartupMlFeatureSnapshot>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupScoringFeatures) private readonly featuresRepo: Repository<StartupScoringFeatures>,
    @InjectRepository(StartupScoreHistory) private readonly history: Repository<StartupScoreHistory>,
  ) {}

  async maybeSnapshot(startup: Startup, features: ScoringFeatures, provenance: FeatureProvenance, result: ScoreResult): Promise<StartupMlFeatureSnapshot | null> {
    const latest = await this.snapshots.findOne({ where: { startupId: startup.id }, order: { snapshotAt: "DESC" } });
    const reason = latest ? materialDiffReason(latest.features, features, latest.provenanceSummary, provenance) : "first snapshot";
    if (latest && !reason) return null;

    return this.create(startup, features, provenance, result, MlSnapshotSource.MATERIAL_CHANGE, reason ?? "first snapshot");
  }

  /** Admin-triggered "force a snapshot now" — bypasses the materiality
   * check entirely; the admin decided this moment matters. Re-reads
   * current features/provenance/latest score itself rather than requiring
   * a caller to have them in hand. */
  async forceSnapshotForStartup(startupId: string): Promise<StartupMlFeatureSnapshot> {
    const { startup, features, provenance, result } = await this.currentStateFor(startupId);
    return this.create(startup, features, provenance, result, MlSnapshotSource.ADMIN_MANUAL, "admin manual snapshot");
  }

  /** Writes a snapshot dated in the past, reconstructed from imported
   * historical evidence (see ml-data/historical/HistoricalSnapshotBuilder)
   * — the one code path in this service that does NOT stamp `new Date()`.
   * `dataConfidence` here is a dedicated historical data-quality score
   * (population/verification/reliability/freshness/conflicts), never the
   * live ScoreResult.confidenceScore, since the two aren't the same
   * concept. Refuses to create a duplicate for the same (startupId,
   * snapshotAt) pair — a historical snapshot, once built, is immutable. */
  async createHistoricalSnapshot(
    startup: Startup, features: ScoringFeatures, provenance: FeatureProvenance,
    snapshotAt: Date, dataConfidence: number, reason: string, selectionMethod?: SnapshotSelectionMethod,
  ): Promise<StartupMlFeatureSnapshot> {
    const existing = await this.snapshots.findOne({ where: { startupId: startup.id, snapshotAt } });
    if (existing) throw new Error(`A snapshot already exists for startup ${startup.id} at ${snapshotAt.toISOString()} — historical snapshots are immutable once built.`);

    const row = this.snapshots.create({
      startupId: startup.id,
      snapshotAt,
      scoreVersion: startup.scoreVersion ?? "RUWAD-2.0",
      featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
      features: { ...features },
      provenanceSummary: { ...provenance },
      dataConfidence,
      scoreStatus: ScoreStatus.NOT_CALCULATED,
      startupStage: startup.stage,
      category: startup.category,
      snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION,
      reason,
      selectionMethod,
      // Outcome-blind declared methods are eligible; anything else (legacy outcome-aware, undeclared) is analysis-only.
      trainingEligibility: defaultEligibilityFor(selectionMethod),
    });
    this.logger.log(`Historical ML feature snapshot created for startup ${startup.id} at ${snapshotAt.toISOString()}: ${reason}`);
    return this.snapshots.save(row);
  }

  /** One row per startup, only for startups with no snapshot yet — never
   * overwrites an existing one, never fabricates a snapshot dated earlier
   * than "now" (see docs/ml-data-methodology.md's backfill semantics: this
   * can only ever be the START of a future observation window, never used
   * to build a label for a period before it existed). Skips a startup
   * whose scoring features have never been calculated at all (nothing
   * meaningful to snapshot yet). */
  async backfillAll(): Promise<{ startupId: string; name: string; created: boolean }[]> {
    const all = await this.startups.find();
    const out: { startupId: string; name: string; created: boolean }[] = [];
    for (const startup of all) {
      const existing = await this.snapshots.findOne({ where: { startupId: startup.id } });
      if (existing) { out.push({ startupId: startup.id, name: startup.name, created: false }); continue; }
      const featuresRow = await this.featuresRepo.findOne({ where: { startupId: startup.id } });
      if (!featuresRow || !Object.keys(featuresRow.features).length) { out.push({ startupId: startup.id, name: startup.name, created: false }); continue; }
      const { features, provenance, result } = await this.currentStateFor(startup.id, startup);
      await this.create(startup, features, provenance, result, MlSnapshotSource.BACKFILLED_CURRENT_STATE, "backfilled from current state");
      out.push({ startupId: startup.id, name: startup.name, created: true });
    }
    return out;
  }

  private async currentStateFor(startupId: string, preloadedStartup?: Startup): Promise<{ startup: Startup; features: ScoringFeatures; provenance: FeatureProvenance; result: ScoreResult }> {
    const startup = preloadedStartup ?? (await this.startups.findOne({ where: { id: startupId } }));
    if (!startup) throw new NotFoundException(`Unknown startup ${startupId}`);
    const featuresRow = await this.featuresRepo.findOne({ where: { startupId } });
    const latestHistory = await this.history.findOne({ where: { startupId }, order: { calculatedAt: "DESC" } });
    const result: ScoreResult = latestHistory
      ? { status: latestHistory.status, ruwadScore: latestHistory.ruwadScore != null ? Number(latestHistory.ruwadScore) : null, confidenceScore: latestHistory.confidenceScore != null ? Number(latestHistory.confidenceScore) : null, version: latestHistory.version, calculatedAt: latestHistory.calculatedAt.toISOString(), factors: latestHistory.factors, missingFactors: latestHistory.missingFactors }
      : emptyScoreResult(startup.scoreVersion ?? "RUWAD-2.0");
    return { startup, features: featuresRow?.features ?? {}, provenance: featuresRow?.provenance ?? {}, result };
  }

  private create(startup: Startup, features: ScoringFeatures, provenance: FeatureProvenance, result: ScoreResult, source: MlSnapshotSource, reason: string): Promise<StartupMlFeatureSnapshot> {
    const row = this.snapshots.create({
      startupId: startup.id,
      snapshotAt: new Date(),
      scoreVersion: result.version,
      featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION,
      features: { ...features },
      provenanceSummary: { ...provenance },
      dataConfidence: result.confidenceScore ?? undefined,
      scoreStatus: result.status,
      startupStage: startup.stage,
      category: startup.category,
      snapshotSource: source,
      reason,
    });
    this.logger.log(`ML feature snapshot created for startup ${startup.id} (${source}): ${reason}`);
    return this.snapshots.save(row);
  }
}

function emptyScoreResult(version: string): ScoreResult {
  const factors = {} as ScoreResult["factors"];
  for (const key of FACTOR_KEYS) factors[key] = { score: null, confidence: 0, reason: "Not yet calculated.", inputsUsed: [], missingInputs: [] };
  return { status: ScoreStatus.NOT_CALCULATED, ruwadScore: null, confidenceScore: null, version, calculatedAt: new Date().toISOString(), factors, missingFactors: [...FACTOR_KEYS] };
}

/** Returns a human-readable reason if any ScoringFeatures value or
 * provenance-verified flag changed since the last snapshot, else null.
 * Compares the full key sets of both objects (added, removed and changed
 * keys all count), not just the keys present in the newer one. */
function materialDiffReason(oldFeatures: ScoringFeatures, newFeatures: ScoringFeatures, oldProvenance: FeatureProvenance, newProvenance: FeatureProvenance): string | null {
  const keys = new Set([...Object.keys(oldFeatures), ...Object.keys(newFeatures)]) as Set<keyof ScoringFeatures>;
  for (const key of keys) {
    if (oldFeatures[key] !== newFeatures[key]) return `${String(key)} changed`;
  }
  const provKeys = new Set([...Object.keys(oldProvenance), ...Object.keys(newProvenance)]) as Set<keyof ScoringFeatures>;
  for (const key of provKeys) {
    const wasVerified = !!oldProvenance[key]?.verified;
    const isVerified = !!newProvenance[key]?.verified;
    if (wasVerified !== isVerified) return `${String(key)} verification changed`;
  }
  return null;
}
