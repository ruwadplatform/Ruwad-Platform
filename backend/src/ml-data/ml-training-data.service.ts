import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { StartupOutcomeCoverage } from "./outcome-coverage.entity";
import { StartupFeatureApplicability } from "./feature-applicability.entity";
import { LabelStatus, TrainingEligibility } from "../common/enums";
import { TARGET_BASELINE_FEATURE, TargetDefinition } from "./labels/target-registry";
import { CoverageMap, coverageLabelContext, effectiveCoverage, LEGACY_LABEL_CONTEXT } from "./labels/outcome-coverage";
import { LabelResult } from "./labels/label-types";
import { ApplicabilityRow, CoreFeatureStates, snapshotFeatureStates } from "./feature-applicability";
import { effectiveEligibility } from "./training-eligibility";
import { FeatureCoverageState } from "../common/enums";

/** V1 = the original rules (every snapshot counts, silence after the window
 * is a negative, no applicability). Kept only so before/after numbers stay
 * reproducible. V2 = the rules training and readiness use. */
export type LabelMode = "V1" | "V2";
export type SnapshotScope = "ELIGIBLE" | "ALL";

/** Everything the label/readiness engines need, loaded once per request. */
export interface TrainingWorld {
  snapshots: StartupMlFeatureSnapshot[];
  eventsByStartup: Map<string, StartupOutcomeEvent[]>;
  coverageByStartup: Map<string, CoverageMap>;
  applicabilityByStartup: Map<string, ApplicabilityRow[]>;
}

export interface EvaluatedSnapshot {
  snapshot: StartupMlFeatureSnapshot;
  eligibility: TrainingEligibility;
  label: LabelResult;
  featureStates: CoreFeatureStates;
}

export interface LabelTally {
  positive: number;
  negative: number;
  /** numeric targets: rows with an AVAILABLE value (no positive/negative split). */
  numericAvailable: number;
  notMatured: number;
  insufficientData: number;
  /** window elapsed, no event on file, outcome family never attested through the window. */
  coverageUnattested: number;
  unverified: number;
  excluded: number;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** The single place that turns (snapshots + events + coverage +
 * applicability) into per-target labels. Class balance, readiness, the
 * export and the dashboard all go through it, so "usable", "positive" and
 * "negative" can never mean different things in different reports. */
@Injectable()
export class MlTrainingDataService {
  constructor(
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshots: Repository<StartupMlFeatureSnapshot>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
    @InjectRepository(StartupOutcomeCoverage) private readonly coverage: Repository<StartupOutcomeCoverage>,
    @InjectRepository(StartupFeatureApplicability) private readonly applicability: Repository<StartupFeatureApplicability>,
  ) {}

  async loadWorld(): Promise<TrainingWorld> {
    const [snapshots, events, coverageRows, applicabilityRows] = await Promise.all([this.snapshots.find(), this.events.find(), this.coverage.find(), this.applicability.find()]);
    const eventsByStartup = new Map<string, StartupOutcomeEvent[]>();
    for (const e of events) { const a = eventsByStartup.get(e.startupId) ?? []; a.push(e); eventsByStartup.set(e.startupId, a); }
    const coverageRowsByStartup = new Map<string, StartupOutcomeCoverage[]>();
    for (const c of coverageRows) { const a = coverageRowsByStartup.get(c.startupId) ?? []; a.push(c); coverageRowsByStartup.set(c.startupId, a); }
    const coverageByStartup = new Map<string, CoverageMap>();
    for (const [id, rows] of coverageRowsByStartup) coverageByStartup.set(id, effectiveCoverage(rows));
    const applicabilityByStartup = new Map<string, ApplicabilityRow[]>();
    for (const r of applicabilityRows) { const a = applicabilityByStartup.get(r.startupId) ?? []; a.push(r); applicabilityByStartup.set(r.startupId, a); }
    return { snapshots, eventsByStartup, coverageByStartup, applicabilityByStartup };
  }

  /** Labels every snapshot in scope for one target. In V2 a target whose
   * baseline feature the startup declared NOT_APPLICABLE is EXCLUDED rather
   * than counted as a negative for an outcome it cannot have. */
  evaluate(world: TrainingWorld, target: TargetDefinition, now: Date, mode: LabelMode = "V2", scope: SnapshotScope = "ELIGIBLE"): EvaluatedSnapshot[] {
    const out: EvaluatedSnapshot[] = [];
    for (const s of world.snapshots) {
      const eligibility = effectiveEligibility(s);
      if (scope === "ELIGIBLE" && eligibility !== TrainingEligibility.ELIGIBLE) continue;
      const events = world.eventsByStartup.get(s.startupId) ?? [];
      const rows = world.applicabilityByStartup.get(s.startupId) ?? [];
      const featureStates = snapshotFeatureStates(s.features as Record<string, unknown>, rows, isoDate(s.snapshotAt));
      const ctx = mode === "V2" ? coverageLabelContext(world.coverageByStartup.get(s.startupId) ?? {}) : LEGACY_LABEL_CONTEXT;
      let label = target.calculate(s, events, now, ctx);
      const baseline = TARGET_BASELINE_FEATURE[target.name];
      if (mode === "V2" && baseline && featureStates[baseline] === FeatureCoverageState.NOT_APPLICABLE) label = { status: LabelStatus.EXCLUDED };
      out.push({ snapshot: s, eligibility, label, featureStates });
    }
    return out;
  }

  tally(rows: EvaluatedSnapshot[], valueType: "boolean" | "numeric"): LabelTally {
    const t: LabelTally = { positive: 0, negative: 0, numericAvailable: 0, notMatured: 0, insufficientData: 0, coverageUnattested: 0, unverified: 0, excluded: 0 };
    for (const { label } of rows) {
      switch (label.status) {
        case LabelStatus.AVAILABLE:
          if (valueType === "boolean") { if (label.valueBoolean) t.positive++; else t.negative++; } else t.numericAvailable++;
          break;
        case LabelStatus.NOT_MATURED: t.notMatured++; break;
        case LabelStatus.INSUFFICIENT_DATA: t.insufficientData++; break;
        case LabelStatus.COVERAGE_UNATTESTED: t.coverageUnattested++; break;
        case LabelStatus.UNVERIFIED: t.unverified++; break;
        default: t.excluded++;
      }
    }
    return t;
  }
}
