import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupFeatureApplicability } from "./feature-applicability.entity";
import { Startup } from "../startups/startup.entity";
import { FeatureApplicabilityStatus, ScoreDataSource } from "../common/enums";
import { ML_FEATURES_V1 } from "./ml-data.constants";
import { MIN_NOT_APPLICABLE_REASON_CHARS } from "./feature-applicability";

export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export interface DeclareApplicabilityInput {
  startupId: string;
  featureKey: string;
  status: FeatureApplicabilityStatus;
  effectiveDate: string;
  reason?: string;
  source: ScoreDataSource;
  verified?: boolean;
  sourceDocumentId?: string;
  createdBy?: string;
  submissionId?: string;
}

/** Sources a row in startup_feature_applicability may carry. FOUNDER_SUBMITTED
 * is deliberately NOT one of them: a founder's claim lives in
 * startup_historical_submissions until an admin reviews it, and only then
 * becomes an ADMIN_ENTERED / VERIFIED_DOCUMENT row. This is what stops a
 * founder from verifying their own applicability. */
const WRITABLE_SOURCES = new Set<ScoreDataSource>([ScoreDataSource.ADMIN_ENTERED, ScoreDataSource.VERIFIED_DOCUMENT, ScoreDataSource.EXTERNAL_SOURCE]);

@Injectable()
export class FeatureApplicabilityService {
  constructor(
    @InjectRepository(StartupFeatureApplicability) private readonly repo: Repository<StartupFeatureApplicability>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
  ) {}

  /** Writes one explicit declaration. NOT_APPLICABLE is never inferred: it needs a reason. */
  async declare(input: DeclareApplicabilityInput): Promise<StartupFeatureApplicability> {
    if (!(ML_FEATURES_V1 as string[]).includes(input.featureKey)) throw new BadRequestException(`"${input.featureKey}" is not an ML feature key.`);
    if (!isIsoDate(input.effectiveDate)) throw new BadRequestException("effectiveDate must be a valid YYYY-MM-DD date.");
    if (input.effectiveDate > todayIso()) throw new BadRequestException("effectiveDate cannot be in the future.");
    if (!WRITABLE_SOURCES.has(input.source)) throw new BadRequestException(`Applicability cannot be written directly with source ${input.source}; a founder's declaration must be submitted for admin review.`);
    const reason = input.reason?.trim();
    if (input.status === FeatureApplicabilityStatus.NOT_APPLICABLE && (!reason || reason.length < MIN_NOT_APPLICABLE_REASON_CHARS)) {
      throw new BadRequestException(`NOT_APPLICABLE needs an explicit reason (at least ${MIN_NOT_APPLICABLE_REASON_CHARS} characters). It is never inferred from a missing value.`);
    }
    if (!(await this.startups.exists({ where: { id: input.startupId } }))) throw new NotFoundException(`Unknown startup ${input.startupId}`);
    return this.repo.save(this.repo.create({ ...input, reason, verified: !!input.verified }));
  }

  list(startupId: string): Promise<StartupFeatureApplicability[]> {
    return this.repo.find({ where: { startupId }, order: { featureKey: "ASC", effectiveDate: "ASC" } });
  }

  /** Withdraws a declaration without deleting it. */
  async revoke(id: string, reason: string): Promise<StartupFeatureApplicability> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Unknown applicability row ${id}`);
    if (!reason?.trim()) throw new BadRequestException("A reason is required to revoke a declaration.");
    row.revokedAt = new Date();
    row.revokedReason = reason.trim();
    return this.repo.save(row);
  }
}
