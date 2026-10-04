import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { MlPrediction } from "./ml-prediction.entity";
import { MlModelRegistryService } from "./ml-model-registry.service";
import { MlInferenceClient } from "./ml-inference-client";
import { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { StartupOutcomeCoverage } from "./outcome-coverage.entity";
import { getTarget } from "./labels/target-registry";
import { coverageLabelContext, effectiveCoverage } from "./labels/outcome-coverage";
import { LabelStatus, MlModelStatus, MlPredictionType } from "../common/enums";
import type { Startup } from "../startups/startup.entity";

/** Generates and stores shadow predictions — internal-only, never surfaced
 * on any public route, and structurally incapable of touching
 * `startups.ruwadScore`: this service is never given the deterministic
 * ScoreResult, only a startup and a feature snapshot, and it has no write
 * path to the startups table at all. Every call is best-effort: a Python
 * outage, a timeout, or an unexpected response shape logs a warning and
 * returns, it never throws back into ScoringService.recalculateStartupScore(). */
@Injectable()
export class MlShadowPredictionService {
  private readonly logger = new Logger(MlShadowPredictionService.name);

  constructor(
    private readonly client: MlInferenceClient,
    private readonly registry: MlModelRegistryService,
    @InjectRepository(MlPrediction) private readonly predictions: Repository<MlPrediction>,
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshots: Repository<StartupMlFeatureSnapshot>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
    @InjectRepository(StartupOutcomeCoverage) private readonly coverage: Repository<StartupOutcomeCoverage>,
  ) {}

  async generateShadowPredictions(startup: Startup, snapshot: StartupMlFeatureSnapshot): Promise<void> {
    if (!this.client.enabled) return;
    try {
      const models = await this.registry.findEligibleForShadowPrediction();
      if (!models.length) return;

      const results = await this.client.predictBatch(
        { startupId: startup.id, snapshotAt: snapshot.snapshotAt.toISOString(), featureSchemaVersion: snapshot.featureSchemaVersion, features: snapshot.features as Record<string, unknown> },
        models.map((m) => m.modelVersion),
      );
      if (!results.length) return;

      const statusByVersion = new Map(models.map((m) => [m.modelVersion, m.status]));
      const rows = results
        .filter((r) => statusByVersion.has(r.modelVersion))
        .map((r) => this.predictions.create({
          startupId: startup.id, snapshotId: snapshot.id, targetName: r.target, targetVersion: r.targetVersion, modelVersion: r.modelVersion,
          prediction: r.prediction, predictionType: r.predictionType as MlPredictionType, predictedAt: new Date(),
          modelStatus: statusByVersion.get(r.modelVersion) as MlModelStatus,
        }));
      if (rows.length) await this.predictions.save(rows);
    } catch (e) {
      this.logger.warn(`Shadow prediction generation failed for startup ${startup.id}, continuing: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  listForStartup(startupId: string): Promise<MlPrediction[]> {
    return this.predictions.find({ where: { startupId }, order: { predictedAt: "DESC" } });
  }

  /** Admin-triggered only — no automatic cron (see docs/ml-training-
   * methodology.md). Backfills `actualOutcome` for every prediction whose
   * target has since matured, by re-running the EXACT SAME label
   * calculator the dataset exporter uses (never a separate
   * re-implementation), so a shadow prediction and a training label always
   * mean the same thing for the same target. */
  async evaluateMaturedPredictions(now: Date = new Date()): Promise<{ evaluated: number; stillImmature: number }> {
    const unevaluated = await this.predictions.find({ where: { evaluatedAt: IsNull() } });
    let evaluated = 0;
    let stillImmature = 0;
    for (const pred of unevaluated) {
      // Current-state EXPERIMENTAL predictions have no historical snapshot; MlExperimentalInferenceService evaluates those itself.
      if (!pred.snapshotId || pred.modelStatus === MlModelStatus.EXPERIMENTAL) continue;
      const target = getTarget(pred.targetName);
      if (!target) continue;
      const snapshot = await this.snapshots.findOne({ where: { id: pred.snapshotId } });
      if (!snapshot) continue;
      const events = await this.events.find({ where: { startupId: pred.startupId } });
      // Same defensible-label rule as training: a negative needs attested coverage of the outcome family.
      const coverage = effectiveCoverage(await this.coverage.find({ where: { startupId: pred.startupId } }));
      const label = target.calculate(snapshot, events, now, coverageLabelContext(coverage));
      if (label.status !== LabelStatus.AVAILABLE) { stillImmature++; continue; }
      pred.actualOutcome = target.valueType === "boolean" ? (label.valueBoolean ? 1 : 0) : (label.valueNumeric ?? undefined);
      pred.evaluatedAt = now;
      await this.predictions.save(pred);
      evaluated++;
    }
    return { evaluated, stillImmature };
  }
}
