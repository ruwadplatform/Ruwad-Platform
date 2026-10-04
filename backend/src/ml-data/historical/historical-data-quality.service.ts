import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HistoricalEvidence } from "./historical-evidence.entity";
import { StartupExternalIdentity } from "./startup-external-identity.entity";
import { StartupMlFeatureSnapshot } from "../startup-ml-feature-snapshot.entity";
import { MlClassBalanceService } from "../ml-class-balance.service";
import { EvidenceStatus, IdentityMatchStatus, MlSnapshotSource } from "../../common/enums";
import { ML_CORE_FEATURES, ML_FEATURES_V1 } from "../ml-data.constants";
import { TARGET_REGISTRY } from "../labels/target-registry";

export interface HistoricalDashboardMetrics {
  companiesMatched: number;
  companiesUnmatched: number;
  companiesReviewRequired: number;
  snapshotsCreated: number;
  snapshotsWithCoreCoverage: number;
  matureLabelsByWindow: Record<number, number>;
  evidenceConflicts: number;
  verifiedEvidencePct: number;
  perFeatureCoverage: { key: string; coveragePct: number }[];
  perSourceTypeCounts: { sourceType: string; rows: number }[];
}

/** The Phase 23/24 dashboard's aggregate queries — reuses
 * MlClassBalanceService for mature-label counts unchanged (the label
 * engine doesn't distinguish a historically-reconstructed snapshot from a
 * live one, by design) rather than re-implementing maturity logic here. */
@Injectable()
export class HistoricalDataQualityService {
  constructor(
    @InjectRepository(HistoricalEvidence) private readonly evidence: Repository<HistoricalEvidence>,
    @InjectRepository(StartupExternalIdentity) private readonly identities: Repository<StartupExternalIdentity>,
    @InjectRepository(StartupMlFeatureSnapshot) private readonly snapshots: Repository<StartupMlFeatureSnapshot>,
    private readonly classBalance: MlClassBalanceService,
  ) {}

  async dashboard(now: Date = new Date()): Promise<HistoricalDashboardMetrics> {
    const [allEvidence, allIdentities, historicalSnapshots, balances] = await Promise.all([
      this.evidence.find(),
      this.identities.find(),
      this.snapshots.find({ where: { snapshotSource: MlSnapshotSource.HISTORICAL_RECONSTRUCTION } }),
      this.classBalance.forAllTargets(now),
    ]);

    const companiesMatched = allIdentities.filter((i) => i.matchStatus === IdentityMatchStatus.MATCHED).length;
    const companiesUnmatched = allIdentities.filter((i) => i.matchStatus === IdentityMatchStatus.UNMATCHED).length;
    const companiesReviewRequired = allIdentities.filter((i) => i.matchStatus === IdentityMatchStatus.REVIEW_REQUIRED || i.matchStatus === IdentityMatchStatus.POSSIBLE_DUPLICATE).length;

    const snapshotsWithCoreCoverage = historicalSnapshots.filter((s) => {
      const populated = ML_CORE_FEATURES.filter((k) => (s.features as Record<string, unknown>)[k] !== undefined && (s.features as Record<string, unknown>)[k] !== null).length;
      return populated / ML_CORE_FEATURES.length >= 0.6;
    }).length;

    const matureLabelsByWindow: Record<number, number> = {};
    for (const target of TARGET_REGISTRY) {
      const balance = balances.find((b) => b.target === target.name);
      if (!balance) continue;
      matureLabelsByWindow[target.windowMonths] = (matureLabelsByWindow[target.windowMonths] ?? 0) + balance.positive + balance.negative;
    }

    const evidenceConflicts = allEvidence.filter((e) => e.status === EvidenceStatus.CONFLICT).length;
    const verifiedEvidencePct = allEvidence.length ? allEvidence.filter((e) => e.verified).length / allEvidence.length : 0;

    const perFeatureCoverage = ML_FEATURES_V1.map((key) => {
      const forKey = allEvidence.filter((e) => e.fieldKey === key);
      const distinctStartups = new Set(allEvidence.map((e) => e.startupId)).size || 1;
      const coveredStartups = new Set(forKey.map((e) => e.startupId)).size;
      return { key, coveragePct: coveredStartups / distinctStartups };
    });

    const bySourceType = new Map<string, number>();
    for (const e of allEvidence) bySourceType.set(e.sourceType, (bySourceType.get(e.sourceType) ?? 0) + 1);
    const perSourceTypeCounts = [...bySourceType.entries()].map(([sourceType, rows]) => ({ sourceType, rows }));

    return {
      companiesMatched, companiesUnmatched, companiesReviewRequired,
      snapshotsCreated: historicalSnapshots.length, snapshotsWithCoreCoverage,
      matureLabelsByWindow, evidenceConflicts, verifiedEvidencePct, perFeatureCoverage, perSourceTypeCounts,
    };
  }
}
