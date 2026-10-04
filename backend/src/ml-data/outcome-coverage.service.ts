import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupOutcomeCoverage } from "./outcome-coverage.entity";
import { Startup } from "../startups/startup.entity";
import { OutcomeCoverageMethod, OutcomeCoverageType, SourceReliability } from "../common/enums";
import { CoverageMap, effectiveCoverage } from "./labels/outcome-coverage";
import { isIsoDate, todayIso } from "./feature-applicability.service";

export interface AttestCoverageInput {
  startupId: string;
  coverageType: OutcomeCoverageType;
  coverageThrough: string;
  sourceSummary: string;
  method: OutcomeCoverageMethod;
  confidence: SourceReliability;
  notes?: string;
  /** The admin who verified the attestation (always set: an attestation nobody verified does not exist). */
  verifiedBy: string;
  createdBy?: string;
  submissionId?: string;
}

/** Per-outcome-family coverage attestations. This is the only thing that can
 * turn "no event found" into a negative label (see labels/outcome-coverage.ts).
 * It never infers coverage from anything else: no attestation row, no
 * coverage — including from another family's attestation. */
@Injectable()
export class OutcomeCoverageService {
  constructor(
    @InjectRepository(StartupOutcomeCoverage) private readonly repo: Repository<StartupOutcomeCoverage>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
  ) {}

  async attest(input: AttestCoverageInput): Promise<StartupOutcomeCoverage> {
    if (!Object.values(OutcomeCoverageType).includes(input.coverageType)) throw new BadRequestException(`Unknown coverage type "${input.coverageType}".`);
    if (!isIsoDate(input.coverageThrough)) throw new BadRequestException("coverageThrough must be a valid YYYY-MM-DD date.");
    if (input.coverageThrough > todayIso()) throw new BadRequestException("coverageThrough cannot be in the future: coverage means sources were already checked through that date.");
    if (!input.sourceSummary?.trim() || input.sourceSummary.trim().length < 10) throw new BadRequestException("sourceSummary must say which sources were checked (at least 10 characters).");
    if (!input.verifiedBy) throw new BadRequestException("An attestation must be verified by a named reviewer.");
    if (!(await this.startups.exists({ where: { id: input.startupId } }))) throw new NotFoundException(`Unknown startup ${input.startupId}`);
    return this.repo.save(this.repo.create({ ...input, sourceSummary: input.sourceSummary.trim(), verifiedAt: new Date() }));
  }

  list(startupId?: string): Promise<StartupOutcomeCoverage[]> {
    return this.repo.find({ where: startupId ? { startupId } : {}, order: { startupId: "ASC", coverageType: "ASC", coverageThrough: "ASC" } });
  }

  async effectiveFor(startupId: string): Promise<CoverageMap> {
    return effectiveCoverage(await this.repo.find({ where: { startupId } }));
  }

  /** Withdraws an attestation without deleting it; labels that relied on it
   * go back to COVERAGE_UNATTESTED on the next calculation. */
  async revoke(id: string, reason: string): Promise<StartupOutcomeCoverage> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Unknown coverage attestation ${id}`);
    if (!reason?.trim()) throw new BadRequestException("A reason is required to revoke an attestation.");
    row.revokedAt = new Date();
    row.revokedReason = reason.trim();
    return this.repo.save(row);
  }
}
