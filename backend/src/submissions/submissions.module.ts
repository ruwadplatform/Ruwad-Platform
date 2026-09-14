import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Submission } from "./submission.entity";
import { SubmissionReviewEvent } from "./submission-review-event.entity";
import { SubmissionsService } from "./submissions.service";
import { SubmissionsController } from "./submissions.controller";
import { StartupSubmissionPublisher } from "./publishers/startup-submission.publisher";
import { InvestorSubmissionPublisher } from "./publishers/investor-submission.publisher";
import { HubSubmissionPublisher } from "./publishers/hub-submission.publisher";
import { ResearchSubmissionPublisher } from "./publishers/research-submission.publisher";
import { MultinationalSubmissionPublisher } from "./publishers/multinational-submission.publisher";
import { ActivityModule } from "../activity/activity.module";

/** The five publishers below reach every directory/child entity purely
 * through `manager.getRepository(X)` inside the approval transaction — not
 * `@InjectRepository`, so none of those entities need registering here via
 * TypeOrmModule.forFeature (autoLoadEntities:true already makes them known
 * to the DataSource app-wide; forFeature is only for constructor-injected
 * repos, and this module only injects its own two entities below). */
@Module({
  imports: [TypeOrmModule.forFeature([Submission, SubmissionReviewEvent]), ActivityModule],
  providers: [
    SubmissionsService,
    StartupSubmissionPublisher, InvestorSubmissionPublisher, HubSubmissionPublisher, ResearchSubmissionPublisher, MultinationalSubmissionPublisher,
  ],
  controllers: [SubmissionsController],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
