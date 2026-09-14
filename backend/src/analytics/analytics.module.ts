import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Startup } from "../startups/startup.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { ResearchProject, Publication } from "../research/research-child-entities.entity";
import { Multinational } from "../multinationals/multinational.entity";
import { Partnership } from "../directory-shared/partnership.entity";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Startup, FundingRound, Investor, Hub, ResearchInstitution, ResearchProject, Publication, Multinational, Partnership])],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
