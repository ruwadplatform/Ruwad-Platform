import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Report } from "./report.entity";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { ReportStatsService } from "./report-stats.service";
import { ReportGeneratorService } from "./report-generator.service";
import { ReportAiService } from "./report-ai.service";
import { StartupsModule } from "../startups/startups.module";
import { InvestorsModule } from "../investors/investors.module";
import { ContentModule } from "../content/content.module";

@Module({
  // ContentModule provides the ONE shared Serper client (same SERPER_API_KEY as News & Events) and the research cache.
  imports: [TypeOrmModule.forFeature([Report]), StartupsModule, InvestorsModule, ContentModule],
  providers: [ReportsService, ReportStatsService, ReportGeneratorService, ReportAiService],
  controllers: [ReportsController],
  exports: [ReportsService, TypeOrmModule],
})
export class ReportsModule {}
