import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Startup } from "../startups/startup.entity";
import { StartupScoringFeatures } from "../scoring/startup-scoring-features.entity";
import { StartupScoreHistory } from "../scoring/startup-score-history.entity";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { StartupMlFeatureSnapshot } from "./startup-ml-feature-snapshot.entity";
import { MlModel } from "./ml-model.entity";
import { MlTrainingRun } from "./ml-training-run.entity";
import { MlPrediction } from "./ml-prediction.entity";
import { OutcomeEventsService } from "./outcome-events.service";
import { MlSnapshotService } from "./ml-snapshot.service";
import { MlDataQualityService } from "./ml-data-quality.service";
import { MlCoverageService } from "./ml-coverage.service";
import { MlClassBalanceService } from "./ml-class-balance.service";
import { MlReadinessService } from "./ml-readiness.service";
import { MlDatasetExportService } from "./ml-dataset-export.service";
import { MlInferenceClient } from "./ml-inference-client";
import { MlModelRegistryService } from "./ml-model-registry.service";
import { MlTrainingRunService } from "./ml-training-run.service";
import { MlShadowPredictionService } from "./ml-shadow-prediction.service";
import { MlDataController } from "./ml-data.controller";
import { OutcomeEventsController } from "./outcome-events.controller";
import { MlModelsController } from "./ml-models.controller";
import { HistoricalEvidence } from "./historical/historical-evidence.entity";
import { HistoricalEvidenceAudit } from "./historical/historical-evidence-audit.entity";
import { StartupExternalIdentity } from "./historical/startup-external-identity.entity";
import { HistoricalImportBatch } from "./historical/historical-import-batch.entity";
import { HistoricalImportRow } from "./historical/historical-import-row.entity";
import { HistoricalCohort } from "./historical/historical-cohort.entity";
import { HistoricalCohortMember } from "./historical/historical-cohort-member.entity";
import { StartupIdentityMatchingService } from "./historical/startup-identity-matching.service";
import { HistoricalEvidenceService } from "./historical/historical-evidence.service";
import { HistoricalImportBatchService } from "./historical/historical-import-batch.service";
import { HistoricalSnapshotBuilder } from "./historical/historical-snapshot-builder.service";
import { HistoricalCohortService } from "./historical/historical-cohort.service";
import { HistoricalDataQualityService } from "./historical/historical-data-quality.service";
import { HistoricalDataController } from "./historical/historical-data.controller";
import { StartupFeatureApplicability } from "./feature-applicability.entity";
import { StartupOutcomeCoverage } from "./outcome-coverage.entity";
import { StartupFounderCareer } from "./founder-career.entity";
import { HistoricalSubmission } from "./historical-submission.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { MlTrainingDataService } from "./ml-training-data.service";
import { FeatureApplicabilityService } from "./feature-applicability.service";
import { OutcomeCoverageService } from "./outcome-coverage.service";
import { HistoricalSubmissionService } from "./historical-submission.service";
import { HistoricalContextService } from "./historical/historical-context.service";
import { MlReadinessDashboardService } from "./ml-readiness-dashboard.service";
import { FounderHistoricalDataController } from "./founder-historical-data.controller";
import { ReadinessAdminController } from "./readiness-admin.controller";
import { OrganizationsModule } from "../organizations/organizations.module";

/** Phase 1C/2A — ML training-data infrastructure, model registry and
 * shadow-prediction serving. Deliberately does NOT import ScoringModule
 * (see ml-snapshot.service.ts's doc comment): every service here reads the
 * same entities ScoringService reads, or is a pure HTTP client, rather
 * than depending on ScoringService itself, so ScoringModule can import
 * THIS module (for the snapshot hook and the shadow-prediction hook in
 * recalculateStartupScore(), and for MlInferenceClient inside
 * HttpMlScoringProvider) without a circular module dependency. */
@Module({
  imports: [TypeOrmModule.forFeature([
    Startup, StartupScoringFeatures, StartupScoreHistory, StartupOutcomeEvent, StartupMlFeatureSnapshot, MlModel, MlTrainingRun, MlPrediction,
    HistoricalEvidence, HistoricalEvidenceAudit, StartupExternalIdentity, HistoricalImportBatch, HistoricalImportRow, HistoricalCohort, HistoricalCohortMember,
    StartupFeatureApplicability, StartupOutcomeCoverage, StartupFounderCareer, HistoricalSubmission, FundingRound, DocumentRef,
  ]), OrganizationsModule],
  providers: [
    OutcomeEventsService, MlSnapshotService, MlDataQualityService, MlCoverageService, MlClassBalanceService, MlReadinessService, MlDatasetExportService,
    MlInferenceClient, MlModelRegistryService, MlTrainingRunService, MlShadowPredictionService,
    StartupIdentityMatchingService, HistoricalEvidenceService, HistoricalImportBatchService, HistoricalSnapshotBuilder, HistoricalCohortService, HistoricalDataQualityService,
    MlTrainingDataService, FeatureApplicabilityService, OutcomeCoverageService, HistoricalSubmissionService, HistoricalContextService, MlReadinessDashboardService,
  ],
  controllers: [MlDataController, OutcomeEventsController, MlModelsController, HistoricalDataController, ReadinessAdminController, FounderHistoricalDataController],
  exports: [OutcomeEventsService, MlSnapshotService, MlInferenceClient, MlModelRegistryService, MlShadowPredictionService],
})
export class MlDataModule {}
