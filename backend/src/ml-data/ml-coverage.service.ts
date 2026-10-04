import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Startup } from "../startups/startup.entity";
import { StartupScoreHistory } from "../scoring/startup-score-history.entity";
import { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { FACTOR_KEYS } from "../scoring/scoring.types";
import { TARGET_REGISTRY } from "./labels/target-registry";
import { LabelStatus } from "../common/enums";
import { LEGACY_LABEL_CONTEXT } from "./labels/outcome-coverage";

export interface ChartDatum { l: string; v: number }

export interface StartupCoverageReport {
  totalPublishedStartups: number;
  with4PlusFactors: number;
  with50PlusConfidence: number;
  with70PlusConfidence: number;
  withComplete12MonthHistory: number;
  withMature12MonthLabels: number;
  byCategory: ChartDatum[];
  byStage: ChartDatum[];
  byFoundedYear: ChartDatum[];
  byCountry: ChartDatum[];
}

/** `/ml-data` startup-coverage report — "is the dataset ready" is a more
 * useful question right now than any model metric. Same in-memory-over-
 * find() approach as ml-data-quality.service.ts: this data volume doesn't
 * need raw aggregate SQL to stay fast, and per-startup "latest history row"
 * / per-snapshot label maturity aren't expressible as a single GROUP BY
 * anyway. */
@Injectable()
export class MlCoverageService {
  constructor(
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupScoreHistory) private readonly history: Repository<StartupScoreHistory>,
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshots: Repository<StartupMlFeatureSnapshot>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
  ) {}

  async report(): Promise<StartupCoverageReport> {
    const [startups, historyRows, snapshotRows, eventRows] = await Promise.all([
      this.startups.find(),
      this.history.find(),
      this.snapshots.find(),
      this.events.find(),
    ]);

    const latestHistoryByStartup = new Map<string, StartupScoreHistory>();
    for (const h of historyRows) {
      const cur = latestHistoryByStartup.get(h.startupId);
      if (!cur || h.calculatedAt > cur.calculatedAt) latestHistoryByStartup.set(h.startupId, h);
    }

    let with4PlusFactors = 0;
    let with50Plus = 0;
    let with70Plus = 0;
    for (const s of startups) {
      const h = latestHistoryByStartup.get(s.id);
      if (h) {
        const factorCount = FACTOR_KEYS.filter((k) => h.factors[k]?.score != null).length;
        if (factorCount >= 4) with4PlusFactors++;
      }
      const conf = s.scoreConfidence != null ? Number(s.scoreConfidence) : null;
      if (conf != null && conf >= 0.5) with50Plus++;
      if (conf != null && conf >= 0.7) with70Plus++;
    }

    const now = new Date();
    const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12);
    const withComplete12MonthHistory = snapshotRows.filter((s) => s.snapshotAt.getTime() <= twelveMonthsAgo.getTime()).length;

    const eventsByStartup = new Map<string, StartupOutcomeEvent[]>();
    for (const e of eventRows) { const arr = eventsByStartup.get(e.startupId) ?? []; arr.push(e); eventsByStartup.set(e.startupId, arr); }
    const raisedTarget = TARGET_REGISTRY.find((t) => t.name === "raisedNewRoundWithin12Months")!;
    let withMature12MonthLabels = 0;
    for (const s of snapshotRows) {
      const result = raisedTarget.calculate(s, eventsByStartup.get(s.startupId) ?? [], now, LEGACY_LABEL_CONTEXT); // maturity only: this metric asks "has the window elapsed", not "is there a defensible label"
      if (result.status !== LabelStatus.NOT_MATURED) withMature12MonthLabels++;
    }

    return {
      totalPublishedStartups: startups.length,
      with4PlusFactors,
      with50PlusConfidence: with50Plus,
      with70PlusConfidence: with70Plus,
      withComplete12MonthHistory,
      withMature12MonthLabels,
      byCategory: groupCount(startups.map((s) => s.category)),
      byStage: groupCount(startups.map((s) => s.stage)),
      byFoundedYear: groupCount(startups.map((s) => String(s.founded))),
      byCountry: groupCount(startups.map((s) => s.country)),
    };
  }
}

function groupCount(values: string[]): ChartDatum[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));
}
