import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupFounderCareer } from "../founder-career.entity";
import { StartupFeatureApplicability } from "../feature-applicability.entity";
import { StartupOutcomeCoverage } from "../outcome-coverage.entity";
import { StartupOutcomeEvent } from "../outcome-event.entity";
import { OutcomeCoverageType, StartupOutcomeEventType } from "../../common/enums";
import { CoverageMap, effectiveCoverage } from "../labels/outcome-coverage";

export interface HistoricalContext {
  careers: StartupFounderCareer[];
  applicability: StartupFeatureApplicability[];
  fundingEvents: StartupOutcomeEvent[];
  coverage: CoverageMap;
}

/** The extra, per-startup inputs a historical snapshot is derived from:
 * founder career anchors, applicability declarations, funding events and
 * attested coverage. Kept apart from HistoricalSnapshotBuilder so the builder
 * stays a pure "evidence + context -> feature vector" step. */
@Injectable()
export class HistoricalContextService {
  constructor(
    @InjectRepository(StartupFounderCareer) private readonly careers: Repository<StartupFounderCareer>,
    @InjectRepository(StartupFeatureApplicability) private readonly applicability: Repository<StartupFeatureApplicability>,
    @InjectRepository(StartupOutcomeCoverage) private readonly coverage: Repository<StartupOutcomeCoverage>,
    @InjectRepository(StartupOutcomeEvent) private readonly events: Repository<StartupOutcomeEvent>,
  ) {}

  async load(startupId: string): Promise<HistoricalContext> {
    const [careers, applicability, coverageRows, fundingEvents] = await Promise.all([
      this.careers.find({ where: { startupId } }),
      this.applicability.find({ where: { startupId } }),
      this.coverage.find({ where: { startupId } }),
      this.events.find({ where: { startupId, eventType: StartupOutcomeEventType.FUNDING_ROUND } }),
    ]);
    return { careers, applicability, fundingEvents, coverage: effectiveCoverage(coverageRows) };
  }
}

export const FUNDING_FAMILY = OutcomeCoverageType.FUNDING;
