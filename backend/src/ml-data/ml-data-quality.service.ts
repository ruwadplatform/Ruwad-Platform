import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { ML_FEATURES_V1 } from "./ml-data.constants";
import type { ScoringFeatureKey } from "../scoring/scoring.types";

export interface FeatureCoverageStat {
  key: string;
  rowCount: number;
  nonNullCount: number;
  missingPct: number;
  uniqueCount: number;
  isCategorical: boolean;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  outlierCount?: number;
  categoryDistribution?: { value: string; count: number }[];
  verifiedPct: number;
}

export interface DataQualityIssue {
  kind: string;
  startupId: string;
  snapshotId?: string;
  detail: string;
}

// The only string-valued ScoringFeatures key — everything else in
// ML_FEATURES_V1 is a number or boolean. Booleans are also treated as
// categorical (true/false distribution) rather than given min/max/mean.
const CATEGORICAL_KEYS = new Set<ScoringFeatureKey>([
  "regulatoryMilestone", "previousStartupExperience", "clinicalData", "clinicalValidation", "proprietaryTechnology",
]);

function quartile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

/** Per-feature coverage/quality stats over every feature snapshot, plus
 * structural data-quality checks (impossible values, future-dated events,
 * duplicate snapshots). Mirrors analytics.service.ts's "compute live, no
 * cached table" approach — at this data scale, in-memory computation over
 * `find()` is simpler and just as fast as a raw aggregate query, and it's
 * the only way to reach into each row's `features` jsonb per-key anyway. */
@Injectable()
export class MlDataQualityService {
  constructor(
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshots: Repository<StartupMlFeatureSnapshot>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
  ) {}

  async featureCoverage(): Promise<FeatureCoverageStat[]> {
    const rows = await this.snapshots.find();
    return ML_FEATURES_V1.map((key) => this.statFor(key, rows));
  }

  private statFor(key: ScoringFeatureKey, rows: StartupMlFeatureSnapshot[]): FeatureCoverageStat {
    const present = rows.filter((r) => r.features[key] !== undefined && r.features[key] !== null);
    const values = present.map((r) => r.features[key]);
    const uniqueCount = new Set(values.map((v) => JSON.stringify(v))).size;
    const isCategorical = CATEGORICAL_KEYS.has(key);
    const verifiedCount = present.filter((r) => r.provenanceSummary[key]?.verified).length;

    const base: FeatureCoverageStat = {
      key,
      rowCount: rows.length,
      nonNullCount: present.length,
      missingPct: rows.length ? Math.round(((rows.length - present.length) / rows.length) * 1000) / 10 : 0,
      uniqueCount,
      isCategorical,
      verifiedPct: present.length ? Math.round((verifiedCount / present.length) * 1000) / 10 : 0,
    };

    if (isCategorical) {
      const dist = new Map<string, number>();
      for (const v of values) { const k = String(v); dist.set(k, (dist.get(k) ?? 0) + 1); }
      base.categoryDistribution = [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
      return base;
    }

    const numeric = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
    if (!numeric.length) return base;
    base.min = numeric[0];
    base.max = numeric[numeric.length - 1];
    base.mean = Math.round((numeric.reduce((a, v) => a + v, 0) / numeric.length) * 100) / 100;
    base.median = Math.round(quartile(numeric, 0.5) * 100) / 100;
    const q1 = quartile(numeric, 0.25);
    const q3 = quartile(numeric, 0.75);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    base.outlierCount = numeric.filter((v) => v < lo || v > hi).length;
    return base;
  }

  /** Flags structural problems, never silently corrects them — an admin
   * decides what to do with each. */
  async dataQualityIssues(): Promise<DataQualityIssue[]> {
    const [snapshots, events] = await Promise.all([this.snapshots.find(), this.events.find()]);
    const issues: DataQualityIssue[] = [];
    const now = new Date();

    for (const s of snapshots) {
      for (const [key, value] of Object.entries(s.features)) {
        if (typeof value !== "number") continue;
        if (Number.isNaN(value)) issues.push({ kind: "NAN_VALUE", startupId: s.startupId, snapshotId: s.id, detail: `${key} is NaN` });
        else if (!Number.isFinite(value)) issues.push({ kind: "INFINITE_VALUE", startupId: s.startupId, snapshotId: s.id, detail: `${key} is Infinite` });
        else if (value < 0 && (key === "annualRevenue" || key === "customerCount" || key === "activeUsers" || key === "teamSize" || key === "fundingRounds")) {
          issues.push({ kind: "IMPOSSIBLE_NEGATIVE", startupId: s.startupId, snapshotId: s.id, detail: `${key} is negative (${value})` });
        }
      }
    }

    const seen = new Map<string, number>();
    for (const s of snapshots) {
      const key = `${s.startupId}:${JSON.stringify(s.features)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) issues.push({ kind: "DUPLICATE_SNAPSHOT", startupId: key.split(":")[0], detail: `${count} snapshots with identical features` });
    }

    for (const e of events) {
      if (new Date(`${e.eventDate}T00:00:00.000Z`).getTime() > now.getTime()) {
        issues.push({ kind: "FUTURE_DATED_EVENT", startupId: e.startupId, detail: `${e.eventType} dated ${e.eventDate}, which is in the future` });
      }
      if (e.valueNumeric != null && !Number.isFinite(e.valueNumeric)) {
        issues.push({ kind: "INVALID_EVENT_VALUE", startupId: e.startupId, detail: `${e.eventType} has a non-finite valueNumeric` });
      }
    }

    return issues;
  }
}
