import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Startup } from "./startup.entity";
import { FundingRound } from "./funding-round.entity";
import { Investor } from "../investors/investor.entity";
import { StartupsService } from "./startups.service";
import { StartupsController } from "./startups.controller";
import { DirectorySharedModule } from "../directory-shared/directory-shared.module";
import { InvestmentsModule } from "../investments/investments.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ScoringModule } from "../scoring/scoring.module";
import { MlDataModule } from "../ml-data/ml-data.module";
import { ActivityModule } from "../activity/activity.module";
import { Submission } from "../submissions/submission.entity";
import { StartupProfileEditService } from "./startup-profile-edit.service";

@Module({
  imports: [TypeOrmModule.forFeature([Startup, FundingRound, Investor, Submission]), DirectorySharedModule, InvestmentsModule, OrganizationsModule, ScoringModule, MlDataModule, ActivityModule],
  providers: [StartupsService, StartupProfileEditService],
  controllers: [StartupsController],
  exports: [StartupsService, TypeOrmModule],
})
export class StartupsModule {}
