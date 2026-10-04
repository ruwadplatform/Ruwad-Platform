import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Startup } from "../startups/startup.entity";
import { StartupScoreHistory } from "./startup-score-history.entity";
import { StartupScoringFeatures } from "./startup-scoring-features.entity";
import { StartupScoringFeatureAudit } from "./startup-scoring-feature-audit.entity";
import { ScoreDataSource, ScoreStatus, ScoreTrigger, StartupOutcomeEventType } from "../common/enums";
import { FACTOR_KEYS, FactorKey, FactorResult, FeatureProvenance, FeatureProvenanceEntry, ScoreResult, ScoringFeatureKey, ScoringFeatures } from "./scoring.types";
import { MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, ML_WEIGHT, RULE_WEIGHT, SCORE_VERSION, SOURCE_RANK } from "./scoring.constants";
import { clampConfidence, clampScore } from "./scoring.utils";
import { scoreGrowth } from "./engines/growth.engine";
import { scoreFinancial } from "./engines/financial.engine";
import { scoreMarket } from "./engines/market.engine";
import { scoreTeam } from "./engines/team.engine";
import { scoreRegulatory } from "./engines/regulatory.engine";
import { scoreTechnology } from "./engines/technology.engine";
import { ML_SCORING_PROVIDER, MlScoringProvider } from "./ml/ml-scoring-provider.interface";
import { FeatureDerivationService } from "./feature-derivation.service";
import { MlSnapshotService } from "../ml-data/ml-snapshot.service";
import { OutcomeEventsService } from "../ml-data/outcome-events.service";
import { MlShadowPredictionService } from "../ml-data/ml-shadow-prediction.service";

const ENGINES: Record<FactorKey, (features: ScoringFeatures, startup: Startup) => FactorResult> = {
  growth: scoreGrowth,
  financial: scoreFinancial,
  market: scoreMarket,
  team: scoreTeam,
  regulatory: scoreRegulatory,
  technology: scoreTechnology,
};

/** Single source of truth for RUWĀD scoring. Startup creation/update
 * services never calculate a score themselves — they call
 * recalculateStartupScore() after the row they care about is saved. */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupScoreHistory) private readonly history: Repository<StartupScoreHistory>,
    @InjectRepository(StartupScoringFeatures) private readonly featuresRepo: Repository<StartupScoringFeatures>,
    @InjectRepository(StartupScoringFeatureAudit) private readonly audit: Repository<StartupScoringFeatureAudit>,
    @Inject(ML_SCORING_PROVIDER) private readonly mlProvider: MlScoringProvider,
    private readonly derivation: FeatureDerivationService,
    private readonly mlSnapshots: MlSnapshotService,
    private readonly outcomeEvents: OutcomeEventsService,
    private readonly shadowPredictions: MlShadowPredictionService,
  ) {}

  async getFeatures(startupId: string): Promise<StartupScoringFeatures> {
    return (await this.featuresRepo.findOne({ where: { startupId } })) ?? this.featuresRepo.create({ startupId, features: {}, provenance: {} });
  }

  /** Admin-only, audited write. Never a silent overwrite: every changed key
   * gets its own append-only audit row (previous value, new value, admin,
   * reason) before the feature row itself is saved. */
  async setFeatures(startupId: string, patch: Partial<ScoringFeatures>, source: ScoreDataSource, adminUserId: string, reason: string): Promise<StartupScoringFeatures> {
    const row = await this.getFeatures(startupId);
    const now = new Date().toISOString();
    for (const key of Object.keys(patch) as ScoringFeatureKey[]) {
      const previousValue = row.features[key];
      const newValue = patch[key];
      if (previousValue === newValue) continue;
      await this.audit.save(this.audit.create({ startupId, featureKey: key, previousValue: previousValue ?? null, newValue: newValue ?? null, adminUserId, reason }));
      row.provenance = { ...row.provenance, [key]: { source, verified: source !== ScoreDataSource.PITCH_DECK_EXTRACTED, extractedAt: now } as FeatureProvenanceEntry };
    }
    row.features = { ...row.features, ...patch };
    const saved = await this.featuresRepo.save(row);
    await this.recalculateStartupScore(startupId, ScoreTrigger.ADMIN_OVERRIDE);
    return saved;
  }

  /** Merges extracted values into a startup's feature set without the
   * admin-override audit trail (used by AI Autofill at publish time — the
   * provenance entry itself is the record of where the value came from).
   * Precedence-checked like every other non-admin write (see writeFeatures)
   * — a fresh extraction never silently clobbers a stronger existing value. */
  async mergeExtractedFeatures(startupId: string, patch: Partial<ScoringFeatures>, sourceDocumentId?: string): Promise<void> {
    await this.writeFeatures(startupId, patch, ScoreDataSource.PITCH_DECK_EXTRACTED, sourceDocumentId);
  }

  /** Publish-time entry point: a submission payload splits into what the
   * founder actually typed vs. what's still an untouched AI extraction (see
   * StartupSubmissionPublisher.extractStartupScoringFeatures's aiFilledKeys
   * split). Both go through the same precedence-checked writer — a founder
   * value never gets silently beaten by a lower-ranked extraction, and vice
   * versa an extraction can't downgrade a value that was already verified. */
  async applyFounderAndAiFeatures(startupId: string, founderPatch: Partial<ScoringFeatures>, aiPatch: Partial<ScoringFeatures>, sourceDocumentId?: string): Promise<void> {
    await this.writeFeatures(startupId, aiPatch, ScoreDataSource.PITCH_DECK_EXTRACTED, sourceDocumentId);
    await this.writeFeatures(startupId, founderPatch, ScoreDataSource.FOUNDER_SUBMITTED);
  }

  /** System-derived writes (aggregated from TeamMember/FundingRound/Investment
   * rows — see FeatureDerivationService) go through the same precedence gate,
   * at the lowest rank: a derived count never overwrites a founder- or
   * admin-reported figure for the same key, but does fill it when nothing
   * else has reported it yet. */
  async applyDerivedFeatures(startupId: string, patch: Partial<ScoringFeatures>): Promise<void> {
    await this.writeFeatures(startupId, patch, ScoreDataSource.SYSTEM_DERIVED);
  }

  /** Admin-only: marks existing feature values as verified without changing
   * them, bumping their provenance to VERIFIED_DOCUMENT rank so a later
   * lower-ranked write can't silently override a value a human has checked.
   * Skips any key that isn't currently set — verifying nothing is a no-op,
   * not an error, since the admin page may pass a batch of checked boxes
   * spanning keys the startup doesn't actually have values for. */
  async verifyFeatures(startupId: string, keys: ScoringFeatureKey[], adminUserId: string): Promise<StartupScoringFeatures> {
    const row = await this.getFeatures(startupId);
    const now = new Date().toISOString();
    const provenance: FeatureProvenance = { ...row.provenance };
    let changed = false;
    for (const key of keys) {
      const existing = provenance[key];
      if (!existing || key in row.features === false) continue;
      provenance[key] = { ...existing, source: ScoreDataSource.VERIFIED_DOCUMENT, verified: true, extractedAt: now };
      changed = true;
    }
    if (!changed) return row;
    row.provenance = provenance;
    const saved = await this.featuresRepo.save(row);
    await this.audit.save(this.audit.create({ startupId, featureKey: keys.join(","), previousValue: null, newValue: null, adminUserId, reason: "Marked as verified" }));
    return saved;
  }

  /** Precedence-checked core every non-admin write funnels through. A
   * candidate value is applied only if its source's rank is at least as
   * high as whatever source last set that key — ties still apply (e.g. a
   * founder correcting their own earlier founder-submitted answer), but a
   * strictly weaker source is silently skipped for that key rather than
   * erroring, since a partial-precedence write (some keys win, some don't)
   * is the whole point of merging two patches from different sources. */
  private async writeFeatures(startupId: string, patch: Partial<ScoringFeatures>, source: ScoreDataSource, sourceDocumentId?: string): Promise<void> {
    if (!Object.keys(patch).length) return;
    const row = await this.getFeatures(startupId);
    const now = new Date().toISOString();
    const nextFeatures: Partial<ScoringFeatures> = { ...row.features };
    const nextProvenance: FeatureProvenance = { ...row.provenance };
    let newRegulatoryMilestone: string | undefined;
    for (const key of Object.keys(patch) as ScoringFeatureKey[]) {
      const value = patch[key];
      if (value === undefined) continue;
      const existingRank = row.provenance[key] ? SOURCE_RANK[row.provenance[key]!.source] : -1;
      if (SOURCE_RANK[source] < existingRank) continue;
      if (key === "regulatoryMilestone" && value !== row.features.regulatoryMilestone) newRegulatoryMilestone = value as string;
      (nextFeatures as Record<string, unknown>)[key] = value;
      nextProvenance[key] = { source, verified: source === ScoreDataSource.VERIFIED_DOCUMENT, sourceDocumentId, extractedAt: now };
    }
    row.startupId = startupId;
    row.features = nextFeatures;
    row.provenance = nextProvenance;
    await this.featuresRepo.save(row);

    // Automatic outcome-event derivation: a founder- or AI-reported
    // regulatory milestone change is real evidence of regulatory progress,
    // worth logging as a future ML label input even though nobody
    // explicitly used the outcome-entry UI. Best-effort — never blocks the
    // feature write itself. Admin-entered milestones (via setFeatures) are
    // intentionally NOT auto-derived here; an admin editing a value
    // directly already has the dedicated outcome-entry UI if they also
    // want to log it as an event.
    if (newRegulatoryMilestone) {
      this.outcomeEvents
        .createSystemEventIfNew(startupId, { eventType: StartupOutcomeEventType.REGULATORY_MILESTONE, eventDate: now.slice(0, 10), valueText: newRegulatoryMilestone })
        .catch((e) => this.logger.warn(`Automatic regulatory outcome-event derivation failed for ${startupId}: ${e instanceof Error ? e.message : "unknown error"}`));
    }
  }

  async getScoreForStartup(startupId: string): Promise<ScoreResult> {
    const latest = await this.history.findOne({ where: { startupId }, order: { calculatedAt: "DESC" } });
    return latest ? toScoreResult(latest) : emptyResult();
  }

  async getScoreHistory(startupId: string): Promise<StartupScoreHistory[]> {
    const rows = await this.history.find({ where: { startupId }, order: { calculatedAt: "ASC" } });
    // Same numeric-column-comes-back-as-a-string fix as toScoreResult() —
    // every row here is served straight to the admin history table.
    for (const r of rows) {
      if (r.ruwadScore != null) r.ruwadScore = Number(r.ruwadScore);
      if (r.confidenceScore != null) r.confidenceScore = Number(r.confidenceScore);
    }
    return rows;
  }

  async recalculateStartupScore(startupId: string, triggeredBy: ScoreTrigger): Promise<ScoreResult> {
    const startup = await this.startups.findOne({ where: { id: startupId } });
    if (!startup) throw new Error(`Cannot score unknown startup ${startupId}`);

    // Refresh system-derived features (team size, founder count, funding
    // rounds, investor count, aggregated founder experience) from the
    // startup's own related tables before every calculation — one place,
    // run on every recalculation so it never drifts stale after a founder
    // adds a team member or round outside the submission flow.
    const derived = await this.derivation.deriveScoringFeatures(startupId);
    if (Object.keys(derived).length) await this.applyDerivedFeatures(startupId, derived);

    const featuresRow = await this.getFeatures(startupId);

    let result: ScoreResult;
    try {
      result = compute(featuresRow.features, startup);
      const ml = await this.mlProvider.predict(featuresRow.features).catch((e) => {
        this.logger.warn(`ML scoring provider failed for ${startupId}, continuing rule-only: ${e instanceof Error ? e.message : "unknown error"}`);
        return null;
      });
      if (ml && result.ruwadScore != null) {
        result.ruwadScore = clampScore(RULE_WEIGHT * result.ruwadScore + ML_WEIGHT * ml.score);
      }
    } catch (e) {
      this.logger.error(`Scoring failed for startup ${startupId}: ${e instanceof Error ? e.message : "unknown error"}`);
      result = { ...emptyResult(), status: ScoreStatus.ERROR };
    }

    const saved = await this.history.save(this.history.create({
      startupId, status: result.status, ruwadScore: result.ruwadScore ?? undefined, confidenceScore: result.confidenceScore ?? undefined,
      version: result.version, factors: result.factors, missingFactors: result.missingFactors, triggeredBy, calculatedAt: new Date(result.calculatedAt),
    }));

    await this.startups.update(startupId, {
      ruwadScore: saved.ruwadScore ?? undefined,
      scoreStatus: saved.status,
      scoreConfidence: saved.confidenceScore ?? undefined,
      scoreVersion: saved.version,
      scoreCalculatedAt: saved.calculatedAt,
    });

    // Best-effort: an ML snapshotting failure must never block scoring
    // itself, same reasoning as the ML provider's own try/catch above.
    let snapshot: Awaited<ReturnType<typeof this.mlSnapshots.maybeSnapshot>> = null;
    try {
      snapshot = await this.mlSnapshots.maybeSnapshot(startup, featuresRow.features, featuresRow.provenance, result);
    } catch (e) {
      this.logger.warn(`ML feature snapshot failed for ${startupId}, continuing: ${e instanceof Error ? e.message : "unknown error"}`);
    }

    // Shadow predictions — the real Phase 2A mechanism (see
    // MlShadowPredictionService's own doc comment). Only runs when a new
    // snapshot actually exists to predict from; best-effort, and has no
    // write path back into `result`/`startups.ruwadScore` at all.
    if (snapshot) {
      try {
        await this.shadowPredictions.generateShadowPredictions(startup, snapshot);
      } catch (e) {
        this.logger.warn(`Shadow prediction generation failed for ${startupId}, continuing: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    return result;
  }

  /** Admin-only, run-on-demand (never on boot): recalculates every published
   * startup — refreshing derived features and appending a new history row
   * for each — without touching any existing history row or downgrading a
   * verified/admin-entered feature (both guaranteed by the same code path
   * every other recalculation already goes through). One failure never
   * stops the rest; each row's outcome is reported back individually. */
  async backfillAll(): Promise<{ startupId: string; name: string; status: ScoreStatus; error?: string }[]> {
    const startups = await this.startups.find();
    const out: { startupId: string; name: string; status: ScoreStatus; error?: string }[] = [];
    for (const startup of startups) {
      try {
        const result = await this.recalculateStartupScore(startup.id, ScoreTrigger.ADMIN_RECALCULATION);
        out.push({ startupId: startup.id, name: startup.name, status: result.status });
      } catch (e) {
        out.push({ startupId: startup.id, name: startup.name, status: ScoreStatus.ERROR, error: e instanceof Error ? e.message : "unknown error" });
      }
    }
    return out;
  }
}

function compute(features: ScoringFeatures, startup: Startup): ScoreResult {
  const factors = {} as Record<FactorKey, FactorResult>;
  for (const key of FACTOR_KEYS) factors[key] = ENGINES[key](features, startup);

  const computed = FACTOR_KEYS.filter((k) => factors[k].score != null);
  const missingFactors = FACTOR_KEYS.filter((k) => factors[k].score == null);
  const meanConfidence = computed.length ? computed.reduce((a, k) => a + factors[k].confidence, 0) / computed.length : 0;

  const eligible = computed.length >= MIN_FACTOR_COVERAGE && meanConfidence >= MIN_OVERALL_CONFIDENCE;
  const status = eligible ? ScoreStatus.CALCULATED : ScoreStatus.INSUFFICIENT_DATA;
  const ruwadScore = eligible ? clampScore(computed.reduce((a, k) => a + (factors[k].score as number), 0) / computed.length) : null;
  const confidenceScore = eligible ? clampConfidence(meanConfidence) : null;

  return { status, ruwadScore, confidenceScore, version: SCORE_VERSION, calculatedAt: new Date().toISOString(), factors, missingFactors };
}

function emptyResult(): ScoreResult {
  const factors = {} as Record<FactorKey, FactorResult>;
  for (const key of FACTOR_KEYS) factors[key] = { score: null, confidence: 0, reason: "Not yet calculated.", inputsUsed: [], missingInputs: [] };
  return { status: ScoreStatus.NOT_CALCULATED, ruwadScore: null, confidenceScore: null, version: SCORE_VERSION, calculatedAt: new Date().toISOString(), factors, missingFactors: [...FACTOR_KEYS] };
}

function toScoreResult(row: StartupScoreHistory): ScoreResult {
  // Postgres numeric columns come back from the driver as strings, not
  // numbers (same reason StartupsService.toDetail() wraps its own
  // ruwadScore in Number() for the public payload) — every reader of a
  // ScoreResult expects a real number or null, never "7.55".
  return {
    status: row.status, ruwadScore: row.ruwadScore != null ? Number(row.ruwadScore) : null, confidenceScore: row.confidenceScore != null ? Number(row.confidenceScore) : null,
    version: row.version, calculatedAt: row.calculatedAt.toISOString(), factors: row.factors, missingFactors: row.missingFactors,
  };
}
