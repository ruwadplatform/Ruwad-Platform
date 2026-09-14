import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Investor } from "./investor.entity";
import { InvestorsService } from "./investors.service";
import { InvestorsController } from "./investors.controller";
import { DirectorySharedModule } from "../directory-shared/directory-shared.module";
import { InvestmentsModule } from "../investments/investments.module";
import { StartupsModule } from "../startups/startups.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [TypeOrmModule.forFeature([Investor]), DirectorySharedModule, InvestmentsModule, StartupsModule, OrganizationsModule],
  providers: [InvestorsService],
  controllers: [InvestorsController],
  exports: [InvestorsService, TypeOrmModule],
})
export class InvestorsModule {}
