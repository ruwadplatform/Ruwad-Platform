import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { MlPrediction } from "./ml-prediction.entity";
import { Startup } from "../startups/startup.entity";
import { StartupScoringFeatures } from "../scoring/startup-scoring-features.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { StartupOutcomeCoverage } from "./outcome-coverage.entity";
import { MlModel } from "./ml-model.entity";
import { MlInferenceClient, ExperimentalPredictResult } from "./ml-inference-client";
import { MlModelRegistryService } from "./ml-model-registry.service";
import { FeatureDerivationService } from "../scoring/feature-derivation.service";
import { LabelStatus, MlModelStatus, MlPredictionType } from "../common/enums";
import { ML_FEATURE_SCHEMA_VERSION } from "./ml-data.constants";
import { assembleInput, bucketFor, emptyDistribution, inputHash } from "./experimental-inference.logic";
import { getTarget } from "./labels/target-registry";
import { coverageLabelContext, effectiveCoverage } from "./labels/outcome-coverage";
import { addMonths } from "./labels/observation-windows";

export type RunStatus = "DISABLED" | "MODEL_UNAVAILABLE" | "INSUFFICIENT_DATA" | "UNCHANGED" | "PREDICTED" | "FAILED";

export interface RunOutcome {
  status: RunStatus;
  startupId: string;
  prediction?: MlPrediction;
  reasons?: string[];
  detail?: string;
}

export interface BatchSummary {
  total: number;
  /** Startups with no usable allow-listed feature at all: the model is not even called. */
  skippedNoFeatures: number;
  calledModel: number;
  predicted: number;
  unchanged: number;
  insufficientData: number;
  failed: number;
  distribution: Record<string, number>;
  failures: { startupId: string; name: string; reason: string }[];
  notice: string;
}

const MODEL_UNAVAILABLE_REASONS = { NOT_CONFIGURED: "ML_EXPERIMENTAL_MODEL_VERSION is not set", NOT_REGISTERED: "The configured model is not in the registry", NOT_EXPERIMENTAL: "The configured model is not EXPERIMENTAL" } as const;
const TARGET_NAME = "raisedNewRoundWithin6Months";
const NO_FEATURES_REASON = "No usable structured features on file";

/** LIVE EXPERIMENTAL inference — an internal, admin-only estimate that is stored beside, never inside, the RUWĀD Score.
 *
 *  Guard rails (all enforced in code, none by convention):
 *   - off unless ML_EXPERIMENTAL_INFERENCE_ENABLED is exactly "true"; independent of ML_SCORING_ENABLED and of the score weights (ML_WEIGHT stays 0);
 *   - uses exactly ONE configured model (ML_EXPERIMENTAL_MODEL_VERSION, or the older EXPERIMENTAL_MODEL_VERSION), which must be registered with status EXPERIMENTAL — never inferred from
 *     metrics, never SHADOW/ACTIVE;
 *   - input is the allow-listed vector only (see assembleInput); a startup with nothing usable is skipped without calling the model;
 *   - the Python service applies the minimum-data / schema / range gates and may answer INSUFFICIENT_DATA: nothing is stored then, and no
 *     fallback number exists;
 *   - every failure becomes a RunOutcome — this service never throws into scoring, startup creation or profile rendering;
 *   - one row per distinct input: re-running with an unchanged vector does not insert (unless an admin forces a refresh). */
@Injectable()
export class MlExperimentalInferenceService {
  private readonly logger = new Logger(MlExperimentalInferenceService.name);
  private failureCount = 0;
  private failuresByReason: Record<string, number> = {};
  private recentFailures: { at: string; startupId: string; reason: string }[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly client: MlInferenceClient,
    private readonly registry: MlModelRegistryService,
    private readonly derivation: FeatureDerivationService,
    @InjectRepository(MlPrediction) private readonly predictions: Repository<MlPrediction>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupScoringFeatures) private readonly scoringFeatures: Repository<StartupScoringFeatures>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
    @InjectRepository(StartupOutcomeCoverage) private readonly coverage: Repository<StartupOutcomeCoverage>,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>("ML_EXPERIMENTAL_INFERENCE_ENABLED") === "true";
  }

  selectedVersion(): string {
    return (this.config.get<string>("ML_EXPERIMENTAL_MODEL_VERSION") ?? this.config.get<string>("EXPERIMENTAL_MODEL_VERSION") ?? "").trim();
  }

  /** The configured model, only if registered AND strictly EXPERIMENTAL. */
  async resolveModel(): Promise<{ ok: true; model: MlModel } | { ok: false; reason: keyof typeof MODEL_UNAVAILABLE_REASONS }> {
    const version = this.selectedVersion();
    if (!version) return { ok: false, reason: "NOT_CONFIGURED" };
    const model = await this.registry.findByVersion(version);
    if (!model) return { ok: false, reason: "NOT_REGISTERED" };
    if (model.status !== MlModelStatus.EXPERIMENTAL) return { ok: false, reason: "NOT_EXPERIMENTAL" };
    return { ok: true, model };
  }

  /** Current structured RUWĀD data -> allow-listed model input. Read-only: nothing is written and no score is recalculated. */
  async buildInput(startupId: string) {
    const [startup, stored, derived] = await Promise.all([
      this.startups.findOne({ where: { id: startupId } }),
      this.scoringFeatures.findOne({ where: { startupId } }),
      this.derivation.deriveScoringFeatures(startupId),
    ]);
    return { startup, ...assembleInput({ stored: stored?.features, storedProvenance: stored?.provenance as never, derived, employees: startup?.employees ?? null }) };
  }

  /** Never throws. */
  async run(startupId: string, opts: { force?: boolean } = {}): Promise<RunOutcome> {
    try {
      if (!this.isEnabled() || !this.client.experimentalEnabled) return { status: "DISABLED", startupId };
      const resolved = await this.resolveModel();
      if (!resolved.ok) return { status: "MODEL_UNAVAILABLE", startupId, detail: MODEL_UNAVAILABLE_REASONS[resolved.reason] };
      const model = resolved.model;

      const input = await this.buildInput(startupId);
      if (!input.startup) return { status: "FAILED", startupId, detail: "Unknown startup" };
      const hash = inputHash(startupId, model.modelVersion, ML_FEATURE_SCHEMA_VERSION, input.features);
      if (!opts.force) {
        const existing = await this.predictions.findOne({ where: { startupId, modelVersion: model.modelVersion, inputHash: hash } });
        if (existing) {
          if (existing.outcome !== "INSUFFICIENT_DATA") return { status: "UNCHANGED", startupId, prediction: existing };
          const noFeatures = !existing.inputFeatures || Object.keys(existing.inputFeatures).length === 0;
          return { status: "INSUFFICIENT_DATA", startupId, reasons: [noFeatures ? NO_FEATURES_REASON : "Insufficient structured data (unchanged since the last check)"], detail: "UNCHANGED" };
        }
      }
      if (!Object.keys(input.features).length) {
        await this.saveMarker(startupId, model, hash, input.features, 0);
        return { status: "INSUFFICIENT_DATA", startupId, reasons: [NO_FEATURES_REASON] };
      }

      const call = await this.client.predictExperimental({ startupId, featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, features: input.features }, model.modelVersion);
      if (!call.ok) return this.failed(startupId, call.reason);
      const r = call.result;
      if (r.status === "INSUFFICIENT_DATA" || r.prediction === null) {
        await this.saveMarker(startupId, model, hash, input.features, r.featureCompleteness);
        return { status: "INSUFFICIENT_DATA", startupId, reasons: r.reasons.length ? r.reasons : ["Insufficient structured data"] };
      }

      const saved = await this.predictions.save(this.predictions.create({
        startupId, snapshotId: undefined, targetName: r.target, targetVersion: r.targetVersion, modelVersion: r.modelVersion,
        prediction: r.prediction, predictionType: MlPredictionType.PROBABILITY, predictedAt: new Date(),
        modelStatus: MlModelStatus.EXPERIMENTAL, featureSchemaVersion: r.featureSchemaVersion, featureCompleteness: r.featureCompleteness,
        reliability: r.reliability ?? "VERY_LOW", inputFeatures: input.features, inputHash: hash, outcome: "PREDICTED",
      }));
      return { status: "PREDICTED", startupId, prediction: saved };
    } catch (e) {
      return this.failed(startupId, e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : "unknown error"); // first line only: never a stack trace
    }
  }

  /** Called from ScoringService when a snapshot was created, i.e. only on a MATERIAL feature change (not a logo or wording edit). Never throws. */
  async onFeaturesChanged(startupId: string): Promise<void> {
    if (!this.isEnabled()) return;
    await this.run(startupId);
  }

  /** Admin batch: one startup at a time (no burst), nothing forced. */
  async batch(): Promise<BatchSummary> {
    const summary: BatchSummary = {
      total: 0, skippedNoFeatures: 0, calledModel: 0, predicted: 0, unchanged: 0, insufficientData: 0, failed: 0, distribution: emptyDistribution(), failures: [],
      notice: "Experimental model score/probability estimate. Not calibrated, not a forecast, not used in the RUWAD Score.",
    };
    if (!this.isEnabled() || !this.client.experimentalEnabled) { summary.notice = "Experimental inference is disabled; nothing was run."; return summary; }
    const resolved = await this.resolveModel();
    if (!resolved.ok) { summary.notice = `Nothing was run: ${MODEL_UNAVAILABLE_REASONS[resolved.reason]}.`; return summary; }
    const all = await this.startups.find({ select: { id: true, name: true } });
    summary.total = all.length;
    for (const s of all) {
      const out = await this.run(s.id);
      if (out.status === "INSUFFICIENT_DATA" && out.reasons?.[0] === NO_FEATURES_REASON) { summary.skippedNoFeatures++; summary.insufficientData++; continue; }
      summary.calledModel++;
      if (out.status === "PREDICTED") summary.predicted++;
      else if (out.status === "UNCHANGED") summary.unchanged++;
      else if (out.status === "INSUFFICIENT_DATA") summary.insufficientData++;
      else { summary.failed++; summary.failures.push({ startupId: s.id, name: s.name, reason: out.detail ?? out.status }); }
      if (out.prediction && out.prediction.prediction != null) summary.distribution[bucketFor(Number(out.prediction.prediction))]++;
    }
    return summary;
  }

  /** Latest stored prediction for the configured model (admin UI). */
  async latest(startupId: string) {
    const version = this.selectedVersion();
    const resolved = await this.resolveModel();
    const newest = version ? await this.predictions.findOne({ where: { startupId, modelVersion: version }, order: { predictedAt: "DESC" } }) : null;
    // A newer "insufficient data" marker means the current inputs no longer support a prediction; do not present an older number as current.
    const prediction = newest && newest.outcome !== "INSUFFICIENT_DATA" ? newest : null;
    const model = resolved.ok ? resolved.model : version ? await this.registry.findByVersion(version) : null;
    return { enabled: this.isEnabled() && this.client.experimentalEnabled, modelVersion: version || null, model: model ? this.modelSummary(model) : null, modelProblem: resolved.ok ? null : MODEL_UNAVAILABLE_REASONS[resolved.reason], prediction, currentStatus: newest ? (newest.outcome === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "PREDICTED") : "NONE", history: version ? (await this.predictions.find({ where: { startupId, modelVersion: version }, order: { predictedAt: "DESC" }, take: 10 })).filter((h) => h.outcome !== "INSUFFICIENT_DATA") : [] };
  }

  /** Internal monitoring. No accuracy figure exists: no live outcome has matured. */
  async monitoring() {
    const version = this.selectedVersion();
    const rows = version ? await this.predictions.find({ where: { modelVersion: version } }) : [];
    const real = rows.filter((p) => p.outcome !== "INSUFFICIENT_DATA");
    const latestByStartup = new Map<string, MlPrediction>();
    for (const p of rows) { const cur = latestByStartup.get(p.startupId); if (!cur || p.predictedAt > cur.predictedAt) latestByStartup.set(p.startupId, p); }
    const distribution = emptyDistribution();
    let completeness = 0;
    let predicted = 0;
    let insufficient = 0;
    for (const p of latestByStartup.values()) {
      if (p.outcome === "INSUFFICIENT_DATA" || p.prediction == null) { insufficient++; continue; }
      predicted++;
      distribution[bucketFor(Number(p.prediction))]++;
      completeness += Number(p.featureCompleteness ?? 0);
    }
    const resolved = await this.resolveModel();
    return {
      enabled: this.isEnabled() && this.client.experimentalEnabled, selectedModelVersion: version || null, modelStatus: resolved.ok ? resolved.model.status : null,
      modelProblem: resolved.ok ? null : MODEL_UNAVAILABLE_REASONS[resolved.reason], predictionsStored: real.length, startupsWithPrediction: predicted, startupsInsufficientData: insufficient,
      distribution, averageFeatureCompleteness: predicted ? Math.round((completeness / predicted) * 1000) / 1000 : null,
      inferenceFailuresSinceStart: this.failureCount, failuresByReason: { ...this.failuresByReason }, recentFailures: this.recentFailures.slice(-10),
      evaluated: real.filter((p) => p.evaluatedAt).length,
      note: "Failures are counted in memory since this process started. There is no accuracy figure: no live prediction has had its outcome window mature.",
    };
  }

  /** What a startup's OWNER (or an admin) may see under "Predictive Intelligence". Deliberately minimal: no model version, training counts,
   * input features, drivers or hashes — those stay admin-only (see latest()). Built from stored rows only: it never calls the model, so
   * opening the page can neither create a prediction nor fail because the ML service is down.
   *
   * `models` is a list so further models (regulatory progression, revenue growth, ...) can be added later; only models that
   * actually exist are ever listed. */
  async ownerView(startupId: string, scoreCalculatedAt?: Date | string | null): Promise<PredictiveIntelligence> {
    const base = { target: TARGET_NAME, title: "6-Month Funding Outlook", label: "Experimental funding likelihood estimate", experimental: true as const, includedInRuwadScore: false as const, disclaimer: OWNER_DISCLAIMER };
    const enabled = this.isEnabled() && this.client.experimentalEnabled;
    const resolved = enabled ? await this.resolveModel() : null;
    if (!enabled || !resolved?.ok) return { models: [] }; // nothing is running: show no card rather than a broken one
    const latest = await this.predictions.findOne({ where: { startupId, modelVersion: resolved.model.modelVersion }, order: { predictedAt: "DESC" } });
    if (latest && latest.outcome !== "INSUFFICIENT_DATA" && latest.prediction != null) {
      const p = Number(latest.prediction);
      return { models: [{ ...base, status: "AVAILABLE", estimatePercent: roundToFive(p), band: likelihoodBand(p), reliability: latest.reliability === "LOW" ? "LOW" : "VERY_LOW", predictedAt: latest.predictedAt.toISOString() }] };
    }
    if (latest) return { models: [{ ...base, status: "INSUFFICIENT_DATA", message: "Insufficient structured data for an experimental prediction." }] };
    const justScored = scoreCalculatedAt ? Date.now() - new Date(scoreCalculatedAt).getTime() < PROCESSING_WINDOW_MS : false;
    return { models: [{ ...base, status: justScored ? "PROCESSING" : "UNAVAILABLE", message: justScored ? "Processing your experimental prediction…" : "The experimental prediction is not available right now." }] };
  }

  /** Later comparison of experimental predictions with what happened. A prediction made on `predictedAt` is evaluated once its 6-month
   * window has elapsed, with the same coverage-enforced label rules as training. Never promotes or changes any model. */
  async evaluateMatured(now: Date = new Date()): Promise<{ evaluated: number; stillOpen: number }> {
    const open = await this.predictions.find({ where: { evaluatedAt: IsNull(), modelStatus: MlModelStatus.EXPERIMENTAL, outcome: "PREDICTED" } });
    let evaluated = 0;
    let stillOpen = 0;
    for (const p of open) {
      const target = getTarget(p.targetName);
      const startup = await this.startups.findOne({ where: { id: p.startupId } });
      if (!target || !startup) { stillOpen++; continue; }
      const pseudoSnapshot = { snapshotAt: p.predictedAt, features: p.inputFeatures ?? {}, category: startup.category } as never;
      const events = await this.events.find({ where: { startupId: p.startupId } });
      const cov = effectiveCoverage(await this.coverage.find({ where: { startupId: p.startupId } }));
      const label = target.calculate(pseudoSnapshot, events, now, coverageLabelContext(cov));
      if (label.status !== LabelStatus.AVAILABLE || addMonths(p.predictedAt, target.windowMonths) > now && !label.valueBoolean) { stillOpen++; continue; }
      p.actualOutcome = label.valueBoolean ? 1 : 0;
      p.evaluatedAt = now;
      await this.predictions.save(p);
      evaluated++;
    }
    return { evaluated, stillOpen };
  }

  /** Records "the model declined for this exact input" — no number, no reliability — so a page view can say "insufficient data" instead of
   * "not run yet" and the same input is never sent to the model twice. */
  private async saveMarker(startupId: string, model: MlModel, hash: string, features: Record<string, number | boolean>, completeness: number): Promise<void> {
    await this.predictions.save(this.predictions.create({
      startupId, snapshotId: undefined, targetName: model.targetName, targetVersion: model.targetVersion, modelVersion: model.modelVersion,
      prediction: null, outcome: "INSUFFICIENT_DATA", predictionType: MlPredictionType.PROBABILITY, predictedAt: new Date(), modelStatus: MlModelStatus.EXPERIMENTAL,
      featureSchemaVersion: ML_FEATURE_SCHEMA_VERSION, featureCompleteness: completeness, reliability: undefined, inputFeatures: features, inputHash: hash,
    }));
  }

  private modelSummary(m: MlModel) {
    return { modelVersion: m.modelVersion, algorithm: m.algorithm, status: m.status, trainingRows: m.trainingRows, targetName: m.targetName, targetVersion: m.targetVersion, trainedAt: m.trainedAt, datasetVersion: (m.metrics as { datasetVersion?: string })?.datasetVersion ?? null, positiveCount: (m.metrics as { positiveCount?: number })?.positiveCount ?? null, negativeCount: (m.metrics as { negativeCount?: number })?.negativeCount ?? null };
  }

  private failed(startupId: string, reason: string): RunOutcome {
    this.failureCount++;
    this.failuresByReason[reason] = (this.failuresByReason[reason] ?? 0) + 1;
    this.recentFailures.push({ at: new Date().toISOString(), startupId, reason });
    if (this.recentFailures.length > 50) this.recentFailures.shift();
    this.logger.warn(`Experimental inference failed for startup ${startupId} (${reason}); RUWAD scoring is unaffected`);
    return { status: "FAILED", startupId, detail: reason };
  }
}

const OWNER_DISCLAIMER = "Experimental model estimate based on currently available startup information. Not used in your RUWAD Score.";
const PROCESSING_WINDOW_MS = 2 * 60 * 1000;

export type PredictiveStatus = "AVAILABLE" | "INSUFFICIENT_DATA" | "PROCESSING" | "UNAVAILABLE";
export interface PredictiveModelCard {
  target: string; title: string; label: string; experimental: true; includedInRuwadScore: false; disclaimer: string; status: PredictiveStatus;
  /** Nearest 5%: the model is not calibrated, so a finer figure would imply accuracy that does not exist. */
  estimatePercent?: number; band?: string; reliability?: "VERY_LOW" | "LOW"; predictedAt?: string; message?: string;
}
export interface PredictiveIntelligence { models: PredictiveModelCard[] }

export const roundToFive = (p: number): number => Math.min(100, Math.max(0, Math.round((p * 100) / 5) * 5));
export function likelihoodBand(p: number): string {
  if (p < 0.2) return "Lower";
  if (p < 0.4) return "Lower–moderate";
  if (p < 0.6) return "Moderate";
  if (p < 0.8) return "Moderate–higher";
  return "Higher";
}

export type { ExperimentalPredictResult };
export { TARGET_NAME };
