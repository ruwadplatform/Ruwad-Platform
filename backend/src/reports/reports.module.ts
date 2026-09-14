import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Report } from "./report.entity";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { StartupsModule } from "../startups/startups.module";
import { InvestorsModule } from "../investors/investors.module";

@Module({
  imports: [TypeOrmModule.forFeature([Report]), StartupsModule, InvestorsModule],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService, TypeOrmModule],
})
export class ReportsModule {}
