import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HistoricalEvidence } from "./historical-evidence.entity";
import { Startup } from "../../startups/startup.entity";
import { StartupMlFeatureSnapshot } from "../startup-ml-feature-snapshot.entity";
import { MlSnapshotService } from "../ml-snapshot.service";
import { EvidenceStatus, HistoricalEvidenceSourceType, MlSnapshotSource, OutcomeCoverageType, SnapshotSelectionMethod, SourceReliability, TrainingEligibility } from "../../common/enums";
import { DensityClass, densityClassFor, isFixedGridDate, meetsMinDensity } from "./snapshot-planning";
import { ML_CORE_FEATURES, ML_FEATURES_V1 } from "../ml-data.constants";
import type { FeatureProvenance, FeatureProvenanceEntry, ScoringFeatures } from "../../scoring/scoring.types";
import { ScoreDataSource } from "../../common/enums";
import { HistoricalContextService } from "./historical-context.service";
import { customerSeries, deriveFounderFeatures, deriveFundingFeatures } from "./historical-derivation";
import { CoreFeatureStates, snapshotFeatureStates, tallyCoverage } from "../feature-applicability";
import { defaultEligibilityFor } from "../training-eligibility";

export interface SnapshotPreview {
  startupId: string;
  snapshotDate: string;
  features: ScoringFeatures;
  /** Per-feature provenance exactly as it would be stored (source type + verified flag of the winning row). */
  provenance: FeatureProvenance;
  unresolvedFields: string[];
  populatedCoreFeatures: number;
  coreFeatureCount: number;
  coveragePct: number;
  /** Applicability-aware view: NOT_APPLICABLE core features leave the denominator. Absent declarations stay UNKNOWN. */
  featureStates: CoreFeatureStates;
  applicableCoreFeatures: number;
  coveragePctApplicable: number;
  /** Feature keys that were derived (founder career, funding events) rather than read from an evidence row. */
  derivedFeatures: string[];
  /** RICH >=4 core features, ACCEPTABLE 3, SPARSE <=2 (see snapshot-planning.ts). */
  densityClass: DensityClass;
  conflictCount: number;
  dataConfidence: number;
  alreadyExists: boolean;
}

export interface BuildSnapshotOptions {
  selectionMethod?: SnapshotSelectionMethod;
  /** Refuse to build below this density (opt-in; existing callers are unaffected). */
  minDensity?: "ACCEPTABLE" | "RICH";
}

const RELIABILITY_WEIGHT: Record<SourceReliability, number> = {
  [SourceReliability.PRIMARY]: 1, [SourceReliability.HIGH]: 0.8, [SourceReliability.MEDIUM]: 0.55, [SourceReliability.LOW]: 0.3,
};

/** Evidence source type -> the existing ScoreDataSource provenance vocabulary
 * (and so the existing SOURCE_RANK precedence) — no parallel hierarchy. */
const PROVENANCE_SOURCE: Record<HistoricalEvidenceSourceType, ScoreDataSource> = {
  [HistoricalEvidenceSourceType.VERIFIED_DOCUMENT]: ScoreDataSource.VERIFIED_DOCUMENT,
  [HistoricalEvidenceSourceType.ADMIN_ENTERED]: ScoreDataSource.ADMIN_ENTERED,
  [HistoricalEvidenceSourceType.FOUNDER_REPORTED]: ScoreDataSource.FOUNDER_SUBMITTED,
  [HistoricalEvidenceSourceType.SYSTEM_DERIVED]: ScoreDataSource.SYSTEM_DERIVED,
  [HistoricalEvidenceSourceType.PUBLIC_COMPANY_SOURCE]: ScoreDataSource.EXTERNAL_SOURCE,
  [HistoricalEvidenceSourceType.PUBLIC_REGULATORY_SOURCE]: ScoreDataSource.EXTERNAL_SOURCE,
  [HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE]: ScoreDataSource.EXTERNAL_SOURCE,
  [HistoricalEvidenceSourceType.LICENSED_DATABASE]: ScoreDataSource.EXTERNAL_SOURCE,
  [HistoricalEvidenceSourceType.RESEARCH_DATABASE]: ScoreDataSource.EXTERNAL_SOURCE,
  [HistoricalEvidenceSourceType.PATENT_DATABASE]: ScoreDataSource.EXTERNAL_SOURCE,
  [HistoricalEvidenceSourceType.CLINICAL_TRIAL_REGISTRY]: ScoreDataSource.EXTERNAL_SOURCE,
};

function resolveField(rows: HistoricalEvidence[], snapshotDate: string): { row: HistoricalEvidence | null; unresolved: boolean } {
  // Never let evidence dated after the snapshot influence it — the
  // structural leakage guarantee this whole builder exists to enforce.
  const eligible = rows.filter((r) => r.effectiveDate <= snapshotDate && r.status !== EvidenceStatus.REJECTED && r.status !== EvidenceStatus.SUPERSEDED);
  if (!eligible.length) return { row: null, unresolved: false };

  const latestDate = eligible.reduce((max, r) => (r.effectiveDate > max ? r.effectiveDate : max), eligible[0].effectiveDate);
  const atLatest = eligible.filter((r) => r.effectiveDate === latestDate);
  if (atLatest.length === 1) return { row: atLatest[0], unresolved: false };

  const preferred = atLatest.find((r) => r.status === EvidenceStatus.PREFERRED);
  if (preferred) return { row: preferred, unresolved: false };

  const distinctValues = new Set(atLatest.map((r) => `${r.valueNumeric ?? ""}|${r.valueText ?? ""}|${r.valueBoolean ?? ""}`));
  if (distinctValues.size === 1) return { row: atLatest[0], unresolved: false };

  return { row: null, unresolved: true }; // genuine, unresolved conflict — never guess
}

function fieldValue(row: HistoricalEvidence): number | string | boolean | undefined {
  if (row.valueNumeric !== undefined && row.valueNumeric !== null) return row.valueNumeric;
  if (row.valueBoolean !== undefined && row.valueBoolean !== null) return row.valueBoolean;
  // customerCount rows carry their metric type in valueText; it is series metadata, not the value.
  if (row.fieldKey === "customerCount") return undefined;
  return row.valueText;
}

/** Reconstructs a feature vector representing ONLY information effective
 * on or before snapshotDate — the historical counterpart to
 * MlSnapshotService, which always captures "now." Field resolution never
 * guesses: a genuinely conflicting field is simply left out of the
 * feature vector (see resolveField() above), never averaged or picked
 * arbitrarily. Some features are derived rather than read: founder
 * experience from founders' career-start years (as of the snapshot date) and
 * funding counts from recorded funding events (only where funding coverage
 * was attested through the date). */
@Injectable()
export class HistoricalSnapshotBuilder {
  private readonly logger = new Logger(HistoricalSnapshotBuilder.name);

  constructor(
    @InjectRepository(HistoricalEvidence) private readonly evidence: Repository<HistoricalEvidence>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshotRows: Repository<StartupMlFeatureSnapshot>,
    private readonly snapshots: MlSnapshotService,
    private readonly context: HistoricalContextService,
  ) {}

  async preview(startupId: string, snapshotDate: string): Promise<SnapshotPreview> {
    const startup = await this.startups.findOne({ where: { id: startupId } });
    if (!startup) throw new NotFoundException(`Unknown startup ${startupId}`);

    const [rows, ctx] = await Promise.all([this.evidence.find({ where: { startupId } }), this.context.load(startupId)]);
    const byField = new Map<string, HistoricalEvidence[]>();
    for (const r of rows) {
      if (!byField.has(r.fieldKey)) byField.set(r.fieldKey, []);
      byField.get(r.fieldKey)!.push(r);
    }

    const features: ScoringFeatures = {};
    const provenance: FeatureProvenance = {};
    const unresolvedFields: string[] = [];
    const resolvedRows: HistoricalEvidence[] = [];
    const derivedFeatures: string[] = [];

    for (const key of ML_FEATURES_V1) {
      let candidates = byField.get(key) ?? [];
      if (key === "customerCount") candidates = customerSeries(candidates, snapshotDate);
      if (!candidates.length) continue;
      const { row, unresolved } = resolveField(candidates, snapshotDate);
      if (unresolved) { unresolvedFields.push(key); continue; }
      if (!row) continue;
      const value = fieldValue(row);
      if (value === undefined) continue;
      (features as Record<string, unknown>)[key] = value;
      provenance[key as keyof ScoringFeatures] = { source: PROVENANCE_SOURCE[row.sourceType] ?? ScoreDataSource.EXTERNAL_SOURCE, verified: row.verified, sourceDocumentId: row.sourceDocumentId } as FeatureProvenanceEntry;
      resolvedRows.push(row);
    }

    // ---- derived features: only where no direct evidence resolved (or conflicted) for the key ----
    const setDerived = (key: string, value: number | undefined, verified: boolean) => {
      if (value === undefined || (features as Record<string, unknown>)[key] !== undefined || unresolvedFields.includes(key)) return;
      (features as Record<string, unknown>)[key] = value;
      provenance[key as keyof ScoringFeatures] = { source: ScoreDataSource.SYSTEM_DERIVED, verified } as FeatureProvenanceEntry;
      derivedFeatures.push(key);
    };
    const founder = deriveFounderFeatures(ctx.careers, snapshotDate);
    setDerived("founderExperienceYears", founder.founderExperienceYears, founder.verified);
    setDerived("healthcareExperienceYears", founder.healthcareExperienceYears, founder.verified);
    const funding = deriveFundingFeatures(ctx.fundingEvents, ctx.coverage[OutcomeCoverageType.FUNDING], snapshotDate);
    setDerived("fundingRounds", funding.fundingRounds, false);
    setDerived("totalFundingRaised", funding.totalFundingRaised, false);

    const populatedCore = ML_CORE_FEATURES.filter((k) => (features as Record<string, unknown>)[k] !== undefined).length;
    const featureStates = snapshotFeatureStates(features as Record<string, unknown>, ctx.applicability, snapshotDate);
    const tally = tallyCoverage([featureStates]);
    const dataConfidence = this.computeConfidence(resolvedRows, unresolvedFields.length, snapshotDate, populatedCore);
    const existing = await this.snapshotRows.findOne({ where: { startupId, snapshotAt: new Date(`${snapshotDate}T00:00:00Z`) } });

    return {
      startupId, snapshotDate, features, provenance, unresolvedFields,
      populatedCoreFeatures: populatedCore, coreFeatureCount: ML_CORE_FEATURES.length,
      coveragePct: populatedCore / ML_CORE_FEATURES.length,
      featureStates, applicableCoreFeatures: tally.applicable, coveragePctApplicable: tally.pct, derivedFeatures,
      densityClass: densityClassFor(populatedCore),
      conflictCount: unresolvedFields.length, dataConfidence,
      alreadyExists: !!existing,
    };
  }

  async build(startupId: string, snapshotDate: string, reason: string, opts: BuildSnapshotOptions = {}): Promise<{ snapshotId: string; preview: SnapshotPreview }> {
    const startup = await this.startups.findOne({ where: { id: startupId } });
    if (!startup) throw new NotFoundException(`Unknown startup ${startupId}`);
    if (opts.selectionMethod === SnapshotSelectionMethod.FIXED_CALENDAR_GRID && !isFixedGridDate(snapshotDate)) {
      throw new BadRequestException(`FIXED_CALENDAR_GRID snapshots must be dated June 30 or December 31 (got ${snapshotDate}).`);
    }
    const preview = await this.preview(startupId, snapshotDate);
    if (preview.alreadyExists) throw new BadRequestException(`A snapshot already exists for startup ${startupId} at ${snapshotDate} — historical snapshots are immutable once built.`);
    if (opts.minDensity && !meetsMinDensity(preview.densityClass, opts.minDensity)) {
      throw new BadRequestException(`Snapshot is ${preview.densityClass} (${preview.populatedCoreFeatures}/${preview.coreFeatureCount} core features); at least ${opts.minDensity} is required.`);
    }
    const row = await this.snapshots.createHistoricalSnapshot(
      startup, preview.features, preview.provenance, new Date(`${snapshotDate}T00:00:00Z`), preview.dataConfidence, reason, opts.selectionMethod,
    );
    return { snapshotId: row.id, preview };
  }

  /** Declares WHY an existing historical snapshot's date was chosen. Metadata
   * only: it never touches features, snapshotAt or any label input. Settable
   * once — a snapshot already tagged cannot be re-tagged to something else.
   * The training eligibility that follows from the method is set in the same
   * step (outcome-aware -> ANALYSIS_ONLY, outcome-blind -> ELIGIBLE), unless an
   * admin already EXCLUDED the row. */
  async tagSelectionMethod(snapshotId: string, method: SnapshotSelectionMethod): Promise<StartupMlFeatureSnapshot> {
    const row = await this.snapshotRows.findOne({ where: { id: snapshotId } });
    if (!row) throw new NotFoundException(`Unknown snapshot ${snapshotId}`);
    if (row.snapshotSource !== MlSnapshotSource.HISTORICAL_RECONSTRUCTION) throw new BadRequestException("Only historical-reconstruction snapshots carry a selection method.");
    if (row.selectionMethod && row.selectionMethod !== method) throw new BadRequestException(`Snapshot ${snapshotId} is already tagged ${row.selectionMethod}; a declared selection method cannot be changed.`);
    if (row.selectionMethod === method) return row;
    const patch: { selectionMethod: SnapshotSelectionMethod; trainingEligibility?: TrainingEligibility } = { selectionMethod: method };
    if (row.trainingEligibility !== TrainingEligibility.EXCLUDED) patch.trainingEligibility = defaultEligibilityFor(method);
    await this.snapshotRows.update({ id: snapshotId }, patch);
    return { ...row, ...patch };
  }

  /** Metadata-only: ANALYSIS_ONLY <-> ELIGIBLE (only for an outcome-blind
   * selection method) or EXCLUDED. A legacy outcome-aware snapshot can never be
   * made ELIGIBLE. Never touches features, dates or labels. */
  async setTrainingEligibility(snapshotId: string, eligibility: TrainingEligibility, reason?: string): Promise<StartupMlFeatureSnapshot> {
    const row = await this.snapshotRows.findOne({ where: { id: snapshotId } });
    if (!row) throw new NotFoundException(`Unknown snapshot ${snapshotId}`);
    if (eligibility === TrainingEligibility.ELIGIBLE && defaultEligibilityFor(row.selectionMethod) !== TrainingEligibility.ELIGIBLE) {
      throw new BadRequestException(`A snapshot with selection method ${row.selectionMethod ?? "UNDECLARED"} cannot be made training-eligible: only a declared outcome-blind method (fixed calendar grid or another pre-declared rule) can.`);
    }
    if (row.trainingEligibility === eligibility) return row;
    await this.snapshotRows.update({ id: snapshotId }, { trainingEligibility: eligibility });
    this.logger.log(`Snapshot ${snapshotId} training eligibility ${row.trainingEligibility} -> ${eligibility}${reason ? `: ${reason}` : ""}`);
    return { ...row, trainingEligibility: eligibility };
  }

  /** Dedicated historical data-quality score — deliberately NOT the live
   * ScoreResult.confidenceScore (see docs/ml-training-methodology.md's
   * sibling doc): weights core-feature coverage, verification rate,
   * source-reliability mix, evidence-to-snapshot-date freshness, and
   * penalizes unresolved conflicts. */
  private computeConfidence(rows: HistoricalEvidence[], unresolvedCount: number, snapshotDate: string, populatedCore: number): number {
    if (!rows.length) return 0;
    const coverageScore = populatedCore / ML_CORE_FEATURES.length;
    const verifiedScore = rows.filter((r) => r.verified).length / rows.length;
    const reliabilityScore = rows.reduce((sum, r) => sum + RELIABILITY_WEIGHT[r.reliability], 0) / rows.length;
    const snapshotMs = new Date(`${snapshotDate}T00:00:00Z`).getTime();
    const freshnessScore = rows.reduce((sum, r) => {
      const ageDays = Math.max(0, (snapshotMs - new Date(`${r.effectiveDate}T00:00:00Z`).getTime()) / 86_400_000);
      return sum + Math.max(0, 1 - ageDays / 365);
    }, 0) / rows.length;
    const conflictPenalty = Math.min(0.3, unresolvedCount * 0.05);
    const raw = 0.35 * coverageScore + 0.2 * verifiedScore + 0.25 * reliabilityScore + 0.2 * freshnessScore - conflictPenalty;
    return Math.max(0, Math.min(1, Number(raw.toFixed(4))));
  }
}
