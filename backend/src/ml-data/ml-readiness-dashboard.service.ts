import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HistoricalEvidence } from "./historical/historical-evidence.entity";
import { HistoricalSubmission } from "./historical-submission.entity";
import { Startup } from "../startups/startup.entity";
import { EvidenceStatus, FeatureCoverageState, FoundedYearBasis, HistoricalReviewStatus, OutcomeCoverageType, SnapshotSelectionMethod, StartupOutcomeEventType, TrainingEligibility } from "../common/enums";
import { ML_CORE_FEATURES, ML_READINESS_THRESHOLDS } from "./ml-data.constants";
import { TARGET_REGISTRY } from "./labels/target-registry";
import { effectiveEligibility } from "./training-eligibility";
import { MlTrainingDataService } from "./ml-training-data.service";
import { MlReadinessService } from "./ml-readiness.service";
import { MlClassBalanceService } from "./ml-class-balance.service";

/** The best-supported target and the one every report leads with. */
export const FOCUS_TARGET = "raisedNewRoundWithin6Months";

/** One answer to "how close are we to a defensible ML training dataset?" —
 * no vanity metrics: every number is either a readiness input or the gap to
 * one. Computed live from the same labelling path training uses. */
@Injectable()
export class MlReadinessDashboardService {
  constructor(
    private readonly training: MlTrainingDataService,
    private readonly readiness: MlReadinessService,
    private readonly balance: MlClassBalanceService,
    @InjectRepository(HistoricalEvidence) private readonly evidence: Repository<HistoricalEvidence>,
    @InjectRepository(HistoricalSubmission) private readonly submissions: Repository<HistoricalSubmission>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
  ) {}

  async dashboard(now: Date = new Date()) {
    const world = await this.training.loadWorld();
    const [evidenceRows, submissionRows, startupRows] = await Promise.all([this.evidence.find(), this.submissions.find(), this.startups.find()]);

    // ---- snapshots by eligibility and by declared method ----
    const snapshots = { total: world.snapshots.length, eligible: 0, analysisOnly: 0, excluded: 0, byMethod: {} as Record<string, number> };
    for (const s of world.snapshots) {
      const e = effectiveEligibility(s);
      if (e === TrainingEligibility.ELIGIBLE) snapshots.eligible++; else if (e === TrainingEligibility.EXCLUDED) snapshots.excluded++; else snapshots.analysisOnly++;
      const m = s.selectionMethod ?? "UNDECLARED";
      snapshots.byMethod[m] = (snapshots.byMethod[m] ?? 0) + 1;
    }

    // ---- readiness V2 for the focus target, V1 beside it, and the gap ----
    const focusV2 = this.readiness.v2(world, FOCUS_TARGET, now);
    const focusV1 = await this.readiness.forTargetV1(FOCUS_TARGET, now);
    const th = ML_READINESS_THRESHOLDS;
    const gap = {
      usableNeeded: Math.max(0, th.MIN_TRAINING_ROWS - focusV2.usableExamples),
      positiveNeeded: Math.max(0, th.MIN_POSITIVE_ROWS - focusV2.positiveExamples),
      negativeNeeded: Math.max(0, th.MIN_NEGATIVE_ROWS - focusV2.negativeExamples),
      coverageGapPoints: Math.max(0, Math.round((th.MIN_CORE_FEATURE_COVERAGE - focusV2.featureCoverage) * 1000) / 10),
    };

    // ---- feature applicability and coverage over eligible snapshots ----
    const eligibleRows = world.snapshots.filter((s) => effectiveEligibility(s) === TrainingEligibility.ELIGIBLE);
    const eligibleEvaluated = this.training.evaluate(world, TARGET_REGISTRY[0], now, "V2", "ELIGIBLE");
    const featureApplicability = ML_CORE_FEATURES.map((key) => {
      const d = { key, withValue: 0, applicableMissing: 0, unknown: 0, notApplicable: 0 };
      for (const r of eligibleEvaluated) {
        const s = r.featureStates[key];
        if (s === FeatureCoverageState.APPLICABLE_WITH_VALUE) d.withValue++;
        else if (s === FeatureCoverageState.APPLICABLE_MISSING) d.applicableMissing++;
        else if (s === FeatureCoverageState.NOT_APPLICABLE) d.notApplicable++;
        else d.unknown++;
      }
      return d;
    });

    // ---- evidence: verified share and conflicts ----
    const liveEvidence = evidenceRows.filter((e) => e.status !== EvidenceStatus.REJECTED && e.status !== EvidenceStatus.SUPERSEDED);
    const verifiedEvidence = liveEvidence.filter((e) => e.verified).length;
    const evidence = {
      total: liveEvidence.length, verified: verifiedEvidence,
      verifiedPct: liveEvidence.length ? Math.round((verifiedEvidence / liveEvidence.length) * 1000) / 10 : 0,
      openConflicts: evidenceRows.filter((e) => e.status === EvidenceStatus.CONFLICT).length,
    };

    // ---- per-family outcome coverage ----
    const outcomeCoverage = Object.values(OutcomeCoverageType).map((family) => {
      const dates = [...world.coverageByStartup.values()].map((m) => m[family]).filter((d): d is string => !!d).sort();
      return { family, startupsAttested: dates.length, totalStartups: startupRows.length, latestThrough: dates[dates.length - 1] ?? null, earliestThrough: dates[0] ?? null };
    });

    // ---- labels per target (V2, eligible snapshots) ----
    const labels = TARGET_REGISTRY.map((t) => {
      const r = this.balance.reportFor(world, t.name, now, "V2", "ELIGIBLE");
      return { target: t.name, coverageFamily: t.coverageType, valueType: t.valueType, positive: r.positive, negative: r.negative, unknown: r.unknown, notMatured: r.notMatured, insufficientData: r.insufficientData, unverified: r.unverified, excluded: r.excluded };
    });

    // ---- founder-submitted rows waiting on a human ----
    const submissionCounts = { pendingReview: 0, changesRequested: 0, verified: 0, rejected: 0 };
    for (const s of submissionRows) {
      if (s.reviewStatus === HistoricalReviewStatus.PENDING_REVIEW) submissionCounts.pendingReview++;
      else if (s.reviewStatus === HistoricalReviewStatus.CHANGES_REQUESTED) submissionCounts.changesRequested++;
      else if (s.reviewStatus === HistoricalReviewStatus.VERIFIED) submissionCounts.verified++;
      else submissionCounts.rejected++;
    }

    // ---- known data-quality caveats that affect labels ----
    const allEvents = [...world.eventsByStartup.values()].flat();
    const caveats = {
      unverifiedShutdownEvents: allEvents.filter((e) => e.eventType === StartupOutcomeEventType.SHUTDOWN && !e.verified).length,
      estimatedFoundingYears: startupRows.filter((s) => s.foundedBasis !== FoundedYearBasis.KNOWN).length,
      legacyOutcomeAwareSnapshots: world.snapshots.filter((s) => s.selectionMethod === SnapshotSelectionMethod.LEGACY_OUTCOME_AWARE).length,
      undeclaredSnapshots: world.snapshots.filter((s) => !s.selectionMethod).length,
    };

    return {
      generatedAt: now.toISOString(), focusTarget: FOCUS_TARGET, thresholds: focusV2.thresholds,
      snapshots, readinessV2: focusV2, readinessV1: focusV1, gap,
      eligibleSnapshotCount: eligibleRows.length, featureApplicability, evidence, outcomeCoverage, labels, submissions: submissionCounts, caveats,
    };
  }
}
