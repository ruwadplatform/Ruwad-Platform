import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HistoricalCohort } from "./historical-cohort.entity";
import { HistoricalCohortMember } from "./historical-cohort-member.entity";
import { HistoricalSnapshotBuilder, type SnapshotPreview } from "./historical-snapshot-builder.service";

export interface CreateCohortInput {
  name: string;
  region?: string;
  category?: string;
  snapshotDate?: string;
  sourceDescription?: string;
}

export interface BulkSnapshotReport {
  cohortId: string;
  snapshotDate: string;
  eligible: number;
  skippedAlreadyExists: number;
  averageCoveragePct: number;
  totalConflicts: number;
  perStartup: SnapshotPreview[];
}

/** Cohort CRUD + bulk historical-snapshot creation (Phase 16/21/22) — bulk
 * operations always go through preview() first (dry run: coverage/conflict
 * counts, no writes) before build() actually calls
 * HistoricalSnapshotBuilder.build() per member. Never bypasses the
 * readiness gate: this only creates snapshots, readiness is still computed
 * separately by MlReadinessService, unchanged, whenever it's next checked. */
@Injectable()
export class HistoricalCohortService {
  constructor(
    @InjectRepository(HistoricalCohort) private readonly cohorts: Repository<HistoricalCohort>,
    @InjectRepository(HistoricalCohortMember) private readonly members: Repository<HistoricalCohortMember>,
    private readonly builder: HistoricalSnapshotBuilder,
  ) {}

  list(): Promise<HistoricalCohort[]> {
    return this.cohorts.find({ order: { createdAt: "DESC" } });
  }

  create(input: CreateCohortInput): Promise<HistoricalCohort> {
    return this.cohorts.save(this.cohorts.create(input));
  }

  async addMember(cohortId: string, startupId: string): Promise<HistoricalCohortMember> {
    const cohort = await this.cohorts.findOne({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundException(`Unknown cohort ${cohortId}`);
    const existing = await this.members.findOne({ where: { cohortId, startupId } });
    if (existing) return existing;
    return this.members.save(this.members.create({ cohortId, startupId }));
  }

  listMembers(cohortId: string): Promise<HistoricalCohortMember[]> {
    return this.members.find({ where: { cohortId } });
  }

  async bulkPreview(cohortId: string, snapshotDate: string): Promise<BulkSnapshotReport> {
    const members = await this.listMembers(cohortId);
    const previews = await Promise.all(members.map((m) => this.builder.preview(m.startupId, snapshotDate)));
    return this.summarize(cohortId, snapshotDate, previews);
  }

  async bulkBuild(cohortId: string, snapshotDate: string, reason: string): Promise<BulkSnapshotReport> {
    const members = await this.listMembers(cohortId);
    const previews: SnapshotPreview[] = [];
    for (const m of members) {
      const preview = await this.builder.preview(m.startupId, snapshotDate);
      previews.push(preview);
      if (preview.alreadyExists) continue;
      await this.builder.build(m.startupId, snapshotDate, reason);
    }
    return this.summarize(cohortId, snapshotDate, previews);
  }

  private summarize(cohortId: string, snapshotDate: string, previews: SnapshotPreview[]): BulkSnapshotReport {
    const eligible = previews.filter((p) => !p.alreadyExists);
    const skippedAlreadyExists = previews.length - eligible.length;
    const averageCoveragePct = eligible.length ? eligible.reduce((a, p) => a + p.coveragePct, 0) / eligible.length : 0;
    const totalConflicts = previews.reduce((a, p) => a + p.conflictCount, 0);
    return { cohortId, snapshotDate, eligible: eligible.length, skippedAlreadyExists, averageCoveragePct, totalConflicts, perStartup: previews };
  }
}
