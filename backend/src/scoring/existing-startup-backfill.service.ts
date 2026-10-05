import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Startup } from "../startups/startup.entity";
import { TeamMember } from "../directory-shared/team-member.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { Investment } from "../investments/investment.entity";
import { StartupScoringFeatures } from "./startup-scoring-features.entity";
import { StartupScoreHistory } from "./startup-score-history.entity";
import { HistoricalEvidence } from "../ml-data/historical/historical-evidence.entity";
import { Submission } from "../submissions/submission.entity";
import { EntityKind, EvidenceStatus, HistoricalEvidenceSourceType, ScoreStatus, ScoreTrigger, ScoringBasis, SubmissionStatus } from "../common/enums";
import { ML_FEATURES_V1 } from "../ml-data/ml-data.constants";
import { extractStartupScoringFeatures } from "../submissions/publishers/startup-submission.publisher";
import { FACTOR_KEYS, FactorKey, ScoreResult, ScoringFeatures } from "./scoring.types";
import { MIN_FACTOR_COVERAGE, MIN_OVERALL_CONFIDENCE, ML_WEIGHT, RULE_WEIGHT } from "./scoring.constants";
import { FeatureDerivationService } from "./feature-derivation.service";
import { ScoringService, atStoredPrecision } from "./scoring.service";
import { InMemoryTable } from "./in-memory-table";
import { FACTOR_LABELS, FOUNDER_FIELDS } from "./startup-assessment.service";

export interface BackfillStartupRow {
  startupId: string;
  name: string;
  slug: string;
  scoreStatus: "CALCULATED" | "PENDING";
  /** EXISTING_DATA for directory startups that were on the platform before any founder submitted structured data. */
  basis: ScoringBasis;
  ruwadScore: number | null;
  confidence: number | null;
  factors: Record<FactorKey, { score: number | null; confidence: number; missingInputs: string[] }>;
  missingFactors: FactorKey[];
  /** What was mapped into scoring features from existing records (e.g. "headcount -> teamSize"). Empty when nothing was available. */
  mapped: string[];
  /** Versus the status/score the startup holds today. */
  change: "NEW_SCORE" | "NEW_PENDING_STATUS" | "UPDATED" | "UNCHANGED";
}

export interface BackfillReport {
  mode: "DRY_RUN" | "APPLIED";
  rule: { minFactors: number; minMeanFactorConfidence: number; ruleWeight: number; mlWeight: number };
  totals: { startups: number; canReceiveScoreNow: number; remainPending: number; averageConfidenceOfScored: number | null; averageFactorConfidenceOfPending: number | null };
  factorsWithAScore: Record<string, number>;
  missingFactorFrequency: Record<string, number>;
  mostCommonMissingFields: { field: string; label: string | null; startups: number }[];
  readyToScore: string[];
  needingAdditionalData: { name: string; missingFactors: FactorKey[] }[];
  startups: BackfillStartupRow[];
  /** Apply mode only. */
  written?: { historyRows: number; startupsWithNewStatus: number };
  notes: string[];
}

/** Verified, dated evidence that may inform a CURRENT feature value: verified by a person, not rejected/superseded/conflicting, dated in the
 * past, from a source other than the licensed database, a numeric value for a model-schema key. Latest effective date per key wins. */
export function selectEvidenceFeatures(rows: Pick<HistoricalEvidence, "fieldKey" | "valueNumeric" | "effectiveDate" | "sourceType" | "verified" | "status">[], today: string): Partial<ScoringFeatures> {
  const allowed = new Set<string>(ML_FEATURES_V1 as string[]);
  const usable = rows
    .filter((e) => e.verified === true && allowed.has(e.fieldKey) && typeof e.valueNumeric === "number" && Number.isFinite(e.valueNumeric) && e.valueNumeric >= 0)
    .filter((e) => e.status === EvidenceStatus.NO_CONFLICT || e.status === EvidenceStatus.PREFERRED)
    .filter((e) => e.sourceType !== HistoricalEvidenceSourceType.LICENSED_DATABASE)
    .filter((e) => String(e.effectiveDate).slice(0, 10) <= today)
    .sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)));
  const out: Record<string, number> = {};
  for (const e of usable) if (out[e.fieldKey] === undefined) out[e.fieldKey] = e.valueNumeric as number;
  return out as Partial<ScoringFeatures>;
}

/** Calculates the RUWAD Score for startups that already exist, without asking founders to resubmit anything.
 *
 * Per startup it reads what the platform already holds and maps it, with the existing provenance/precedence rules, into scoring features:
 *   - the directory record's headcount (`employees`, only when > 0) -> teamSize
 *   - verified dated evidence (not licensed, not rejected/superseded/conflicting) -> the matching feature
 *   - the approved submission's founder / pitch-deck values, where one exists (same extractor approval uses)
 *   - system-derived features (team, founders, funding rounds and amounts, investors) from the startup's own rows
 * then runs the six engines through the normal ScoringService. Nothing is invented: what is not there stays missing, the thresholds are the
 * existing ones, the experimental ML model is not involved (RULE_WEIGHT=1, ML_WEIGHT=0), and a startup that cannot reach the rule is
 * recorded as Pending with its real missing inputs.
 *
 * DRY RUN (the default) runs the real code over in-memory copies and writes nothing. APPLY writes through the real services and is
 * idempotent: unchanged results add no history row (trigger BACKFILL is deliberately not an always-record trigger). */
@Injectable()
export class ExistingStartupBackfillService {
  private readonly logger = new Logger(ExistingStartupBackfillService.name);

  constructor(
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(TeamMember) private readonly team: Repository<TeamMember>,
    @InjectRepository(FundingRound) private readonly rounds: Repository<FundingRound>,
    @InjectRepository(Investment) private readonly investments: Repository<Investment>,
    @InjectRepository(StartupScoringFeatures) private readonly features: Repository<StartupScoringFeatures>,
    @InjectRepository(StartupScoreHistory) private readonly history: Repository<StartupScoreHistory>,
    @InjectRepository(HistoricalEvidence) private readonly evidence: Repository<HistoricalEvidence>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly scoring: ScoringService,
  ) {}

  async run(opts: { dryRun?: boolean; startupIds?: string[] } = {}): Promise<BackfillReport> {
    const dryRun = opts.dryRun !== false; // anything but an explicit false is a dry run
    const loaded = opts.startupIds?.length ? await this.startups.find({ where: { id: In(opts.startupIds) } }) : await this.startups.find();
    // work on copies: a dry run must never change the objects a repository handed out
    const startups = loaded.map((s) => ({ ...s }) as Startup);
    startups.sort((a, b) => a.name.localeCompare(b.name));
    const ids = startups.map((s) => s.id);
    if (!ids.length) return this.report(dryRun, []);

    const [evidence, submissions] = await Promise.all([
      this.evidence.find({ where: { startupId: In(ids), verified: true } }),
      this.submissions.find({ where: { publishedEntityId: In(ids), kind: EntityKind.STARTUP, status: SubmissionStatus.APPROVED } }),
    ]);
    const today = new Date().toISOString().slice(0, 10);

    // Directory startups (no approved founder submission) are scored on the EXISTING_DATA basis: what is on file counts and a factor with no
    // data counts as 0. Startups a founder submitted through the wizard keep the STANDARD rule. (Dry run: only the in-memory copies change.)
    const submitted = new Set(submissions.map((s) => s.publishedEntityId));
    const needsBasis = startups.filter((s) => !submitted.has(s.id) && s.scoringBasis !== ScoringBasis.EXISTING_DATA);
    for (const s of needsBasis) s.scoringBasis = ScoringBasis.EXISTING_DATA;
    if (!dryRun && needsBasis.length) await this.startups.update({ id: In(needsBasis.map((s) => s.id)) }, { scoringBasis: ScoringBasis.EXISTING_DATA });

    // the scoring service the pipeline runs on: the real one (apply) or the real code over in-memory copies (dry run)
    let svc = this.scoring;
    let historyBefore = 0;
    if (dryRun) {
      const [team, rounds, investments, features, history] = await Promise.all([
        this.team.find({ where: { entityType: EntityKind.STARTUP, entityId: In(ids) } }),
        this.rounds.find({ where: { startupId: In(ids) } }),
        this.investments.find({ where: { targetEntityType: EntityKind.STARTUP, targetEntityId: In(ids) } }),
        this.features.find({ where: { startupId: In(ids) } }),
        this.history.find({ where: { startupId: In(ids) } }),
      ]);
      const derivation = new FeatureDerivationService(new InMemoryTable(team as never) as never, new InMemoryTable(rounds as never) as never, new InMemoryTable(investments as never) as never);
      svc = new ScoringService(
        new InMemoryTable(startups as never) as never, new InMemoryTable(history as never) as never, new InMemoryTable(features as never) as never, new InMemoryTable() as never,
        { predict: async () => null } as never, derivation, { maybeSnapshot: async () => null } as never, { createSystemEventIfNew: async () => null } as never, { generateShadowPredictions: async () => undefined } as never,
        // no experimental ML service: the dry run (and the backfill) never touch the ML model
      );
    } else {
      historyBefore = await this.history.count({ where: { startupId: In(ids) } });
    }

    const rows: BackfillStartupRow[] = [];
    for (const startup of startups) {
      try {
        rows.push(await this.assessOne(svc, startup, evidence.filter((e) => e.startupId === startup.id), submissions.find((s) => s.publishedEntityId === startup.id), today));
      } catch (e) {
        // one failure never stops the rest and never leaves a half-written startup visible as a score
        this.logger.error(`Backfill failed for startup ${startup.id}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    const report = this.report(dryRun, rows);
    if (!dryRun) {
      const historyAfter = await this.history.count({ where: { startupId: In(ids) } });
      report.written = { historyRows: historyAfter - historyBefore, startupsWithNewStatus: rows.filter((r) => r.change !== "UNCHANGED").length };
      this.logger.log(`Existing-startup backfill APPLIED: ${rows.length} startups, ${report.written.historyRows} history rows written, ${report.totals.canReceiveScoreNow} scored, ${report.totals.remainPending} pending`);
    }
    return report;
  }

  private async assessOne(svc: ScoringService, startup: Startup, evidence: HistoricalEvidence[], submission: Submission | undefined, today: string): Promise<BackfillStartupRow> {
    const mapped: string[] = [];
    const external: Partial<ScoringFeatures> = selectEvidenceFeatures(evidence, today);
    for (const k of Object.keys(external)) mapped.push(`${k} <- verified evidence`);
    const headcount = Number(startup.employees);
    if (Number.isFinite(headcount) && headcount > 0) {
      // the directory record's current headcount is the better teamSize than an older dated evidence row
      external.teamSize = headcount;
      if (!mapped.includes("teamSize <- verified evidence")) mapped.push("teamSize <- directory headcount");
      else mapped[mapped.indexOf("teamSize <- verified evidence")] = "teamSize <- directory headcount";
    }
    if (Object.keys(external).length) await svc.applyExternalFeatures(startup.id, external);

    let founderPatch: Partial<ScoringFeatures> = {};
    let aiPatch: Partial<ScoringFeatures> = {};
    if (submission) {
      const aiKeys = new Set(Array.isArray(submission.payload.aiFilledScoringKeys) ? (submission.payload.aiFilledScoringKeys as unknown[]).filter((k): k is string => typeof k === "string") : []);
      ({ founderPatch, aiPatch } = extractStartupScoringFeatures(submission.payload, aiKeys));
      if (Object.keys(founderPatch).length || Object.keys(aiPatch).length) mapped.push("founder / pitch-deck values <- approved submission");
    }

    const before = { status: startup.scoreStatus, score: startup.ruwadScore == null ? null : Number(startup.ruwadScore) };
    const result = await svc.assessStartup(startup.id, { founderPatch, aiPatch, trigger: ScoreTrigger.BACKFILL, runMl: false });
    return this.toRow(startup, result, mapped, before);
  }

  private toRow(startup: Startup, r: ScoreResult, mapped: string[], before: { status: ScoreStatus; score: number | null }): BackfillStartupRow {
    const calculated = r.status === ScoreStatus.CALCULATED && r.ruwadScore != null;
    const same = before.status === r.status && atStoredPrecision(before.score) === atStoredPrecision(r.ruwadScore);
    const change: BackfillStartupRow["change"] = same ? "UNCHANGED" : calculated ? "NEW_SCORE" : before.status === ScoreStatus.NOT_CALCULATED ? "NEW_PENDING_STATUS" : "UPDATED";
    return {
      startupId: startup.id, name: startup.name, slug: startup.slug, scoreStatus: calculated ? "CALCULATED" : "PENDING", basis: startup.scoringBasis ?? ScoringBasis.STANDARD, ruwadScore: calculated ? r.ruwadScore : null, confidence: calculated ? r.confidenceScore : null,
      factors: Object.fromEntries(FACTOR_KEYS.map((k) => [k, { score: r.factors[k].score, confidence: r.factors[k].confidence, missingInputs: [...r.factors[k].missingInputs] }])) as BackfillStartupRow["factors"],
      missingFactors: [...r.missingFactors], mapped, change,
    };
  }

  private report(dryRun: boolean, rows: BackfillStartupRow[]): BackfillReport {
    const scored = rows.filter((r) => r.scoreStatus === "CALCULATED");
    const pending = rows.filter((r) => r.scoreStatus !== "CALCULATED");
    const meanFactorConf = (r: BackfillStartupRow) => {
      const c = FACTOR_KEYS.map((k) => r.factors[k]).filter((f) => f.score != null);
      return c.length ? c.reduce((a, f) => a + f.confidence, 0) / c.length : null;
    };
    const pendingConf = pending.map(meanFactorConf).filter((x): x is number => x != null);
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);

    const factorsWithAScore: Record<string, number> = {};
    const missingFactorFrequency: Record<string, number> = {};
    const missing = new Map<string, number>();
    for (const r of rows) {
      const n = FACTOR_KEYS.filter((k) => r.factors[k].score != null).length;
      factorsWithAScore[n] = (factorsWithAScore[n] ?? 0) + 1;
      for (const f of r.missingFactors) missingFactorFrequency[f] = (missingFactorFrequency[f] ?? 0) + 1;
      const seen = new Set<string>(); // count a field once per startup even if two factors both want it
      for (const k of FACTOR_KEYS) for (const m of r.factors[k].missingInputs) if (!seen.has(m)) { seen.add(m); missing.set(m, (missing.get(m) ?? 0) + 1); }
    }
    const mostCommonMissingFields = [...missing.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 25)
      .map(([field, startups]) => ({ field, label: (FOUNDER_FIELDS as Record<string, { label: string } | undefined>)[field]?.label ?? null, startups }));

    return {
      mode: dryRun ? "DRY_RUN" : "APPLIED",
      rule: { minFactors: MIN_FACTOR_COVERAGE, minMeanFactorConfidence: MIN_OVERALL_CONFIDENCE, ruleWeight: RULE_WEIGHT, mlWeight: ML_WEIGHT },
      totals: { startups: rows.length, canReceiveScoreNow: scored.length, remainPending: pending.length, averageConfidenceOfScored: avg(scored.map((r) => r.confidence as number)), averageFactorConfidenceOfPending: avg(pendingConf) },
      factorsWithAScore, missingFactorFrequency, mostCommonMissingFields,
      readyToScore: scored.map((r) => r.name),
      needingAdditionalData: pending.map((r) => ({ name: r.name, missingFactors: r.missingFactors })),
      startups: rows,
      notes: [
        `Factor labels: ${Object.values(FACTOR_LABELS).join(", ")}.`,
        "Standard rule (new founder submissions, unchanged): at least " + MIN_FACTOR_COVERAGE + " of 6 factors with a score and a mean factor confidence of at least " + Math.round(MIN_OVERALL_CONFIDENCE * 100) + "%.",
        "Existing directory startups (basis EXISTING_DATA): scored on what is on file; a factor with no data counts as 0. A startup with no real data in any factor stays Pending (never a 0 / 10 for 'nothing known').",
        "Nothing is invented: missing inputs stay missing. The experimental ML model is not used.",
        dryRun ? "Dry run: nothing was written." : "Applied: results were written through the normal scoring service; unchanged results add no history row.",
      ],
    };
  }
}
