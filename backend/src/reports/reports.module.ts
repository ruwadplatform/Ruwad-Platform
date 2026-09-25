import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Report } from "./report.entity";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { ReportStatsService } from "./report-stats.service";
import { ReportGeneratorService } from "./report-generator.service";
import { ReportAiService } from "./report-ai.service";
import { ReportLibraryService } from "./library/report-library.service";
import { LibraryStatsService } from "./library/library-stats.service";
import { ReportSubmission } from "./report-submission.entity";
import { ReportFile } from "./report-file.entity";
import { ReportReviewToken } from "./report-review-token.entity";
import { ReportSubmissionsService } from "./report-submissions.service";
import { ReportSubmissionsController } from "./report-submissions.controller";
import { StartupsModule } from "../startups/startups.module";
import { InvestorsModule } from "../investors/investors.module";
import { ContentModule } from "../content/content.module";
import { UsersModule } from "../users/users.module";
import { EmailModule } from "../email/email.module";

@Module({
  // ContentModule provides the ONE shared Serper client (same SERPER_API_KEY as News & Events) and the research cache.
  // EmailModule is the existing Resend-backed EmailService (same EMAIL_FROM / ADMIN_NOTIFICATION_EMAIL as every other notification).
  imports: [TypeOrmModule.forFeature([Report, ReportSubmission, ReportFile, ReportReviewToken]), StartupsModule, InvestorsModule, ContentModule, UsersModule, EmailModule],
  providers: [ReportsService, ReportStatsService, ReportGeneratorService, ReportAiService, ReportSubmissionsService, ReportLibraryService, LibraryStatsService],
  // ReportSubmissionsController first: its fixed paths (my-submissions, review/…) must win over ReportsController's `:slug`.
  controllers: [ReportSubmissionsController, ReportsController],
  exports: [ReportsService, TypeOrmModule],
})
export class ReportsModule {}
