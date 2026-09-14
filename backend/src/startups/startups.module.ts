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

@Module({
  imports: [TypeOrmModule.forFeature([Startup, FundingRound, Investor]), DirectorySharedModule, InvestmentsModule, OrganizationsModule],
  providers: [StartupsService],
  controllers: [StartupsController],
  exports: [StartupsService, TypeOrmModule],
})
export class StartupsModule {}
