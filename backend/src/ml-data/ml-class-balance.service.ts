import { Injectable, NotFoundException } from "@nestjs/common";
import { getTarget, TARGET_REGISTRY } from "./labels/target-registry";
import { LabelMode, MlTrainingDataService, SnapshotScope } from "./ml-training-data.service";

export interface ClassBalanceReport {
  target: string;
  targetVersion: string;
  windowMonths: number;
  valueType: "boolean" | "numeric";
  /** "V2" (default) = training-eligible snapshots, coverage-enforced labels.
   * "V1" = the original all-snapshots, silence-is-negative rules, kept only
   * for before/after comparison. */
  labelMode: LabelMode;
  snapshotScope: SnapshotScope;
  snapshotsConsidered: number;
  positive: number;
  negative: number;
  notMatured: number;
  insufficientData: number;
  /** Matured, no event on file, but the outcome family was never attested through the window: NOT a negative. */
  unknown: number;
  unverified: number;
  excluded: number;
}

/** Never train blindly on heavily imbalanced or mostly-immature data — this
 * is the report that tells you that before you try. Counts come from
 * MlTrainingDataService, the same labelling path the export and Readiness V2
 * use. By default only training-ELIGIBLE snapshots are counted and a
 * negative needs attested outcome coverage. */
@Injectable()
export class MlClassBalanceService {
  constructor(private readonly training: MlTrainingDataService) {}

  async forTarget(targetName: string, now: Date = new Date(), mode: LabelMode = "V2", scope: SnapshotScope = mode === "V2" ? "ELIGIBLE" : "ALL"): Promise<ClassBalanceReport> {
    const target = getTarget(targetName);
    if (!target) throw new NotFoundException(`Unknown ML target "${targetName}"`);
    const world = await this.training.loadWorld();
    return this.reportFor(world, targetName, now, mode, scope);
  }

  reportFor(world: Awaited<ReturnType<MlTrainingDataService["loadWorld"]>>, targetName: string, now: Date, mode: LabelMode, scope: SnapshotScope): ClassBalanceReport {
    const target = getTarget(targetName)!;
    const rows = this.training.evaluate(world, target, now, mode, scope);
    const t = this.training.tally(rows, target.valueType);
    return {
      target: target.name, targetVersion: target.targetVersion, windowMonths: target.windowMonths, valueType: target.valueType,
      labelMode: mode, snapshotScope: scope, snapshotsConsidered: rows.length,
      // numeric targets don't have a positive/negative split — an AVAILABLE row is counted as "positive" (available), as before
      positive: target.valueType === "boolean" ? t.positive : t.numericAvailable,
      negative: t.negative, notMatured: t.notMatured, insufficientData: t.insufficientData,
      unknown: t.coverageUnattested, unverified: t.unverified, excluded: t.excluded,
    };
  }

  async forAllTargets(now: Date = new Date(), mode: LabelMode = "V2", scope: SnapshotScope = mode === "V2" ? "ELIGIBLE" : "ALL"): Promise<ClassBalanceReport[]> {
    const world = await this.training.loadWorld();
    return TARGET_REGISTRY.map((t) => this.reportFor(world, t.name, now, mode, scope));
  }
}
