import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Startup } from "../startups/startup.entity";
import { TeamMember } from "../directory-shared/team-member.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { Investment } from "../investments/investment.entity";
import { StartupScoreHistory } from "./startup-score-history.entity";
import { StartupScoringFeatures } from "./startup-scoring-features.entity";
import { StartupScoringFeatureAudit } from "./startup-scoring-feature-audit.entity";
import { ScoringService } from "./scoring.service";
import { ScoringController, ScoringAdminController } from "./scoring.controller";
import { FeatureDerivationService } from "./feature-derivation.service";
import { ML_SCORING_PROVIDER, MlScoringProvider } from "./ml/ml-scoring-provider.interface";
import { DisabledMlProvider } from "./ml/disabled-ml-provider";
import { HttpMlScoringProvider } from "./ml/http-ml-scoring-provider";
import { MlDataModule } from "../ml-data/ml-data.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { StartupAssessmentService } from "./startup-assessment.service";
import { StartupAssessmentController } from "./startup-assessment.controller";
import { ExistingStartupBackfillService } from "./existing-startup-backfill.service";
import { HistoricalEvidence } from "../ml-data/historical/historical-evidence.entity";
import { Submission } from "../submissions/submission.entity";

/** Single source of truth for RUWĀD startup scoring. Other modules
 * (StartupsModule, SubmissionsModule) import this to call
 * ScoringService.recalculateStartupScore() rather than computing a score
 * themselves — see ScoringService's own doc comment.
 *
 * ML_SCORING_PROVIDER is DisabledMlProvider unless ML_SCORING_ENABLED is
 * exactly "true", in which case HttpMlScoringProvider is bound instead —
 * same optional-provider pattern as EmailService/ResumeParseService. Even
 * when bound, it's mathematically inert on the public score: see
 * ScoringService's RULE_WEIGHT/ML_WEIGHT blend and http-ml-scoring-
 * provider.ts's own doc comment. The REAL Phase 2A shadow-prediction path
 * is MlShadowPredictionService (ml-data module), not this provider. */
@Module({
  imports: [TypeOrmModule.forFeature([Startup, TeamMember, FundingRound, Investment, StartupScoreHistory, StartupScoringFeatures, StartupScoringFeatureAudit, HistoricalEvidence, Submission]), MlDataModule, OrganizationsModule],
  providers: [
    ScoringService, StartupAssessmentService, ExistingStartupBackfillService, FeatureDerivationService, DisabledMlProvider, HttpMlScoringProvider,
    {
      provide: ML_SCORING_PROVIDER,
      useFactory: (config: ConfigService, http: HttpMlScoringProvider, disabled: DisabledMlProvider): MlScoringProvider =>
        config.get<string>("ML_SCORING_ENABLED") === "true" ? http : disabled,
      inject: [ConfigService, HttpMlScoringProvider, DisabledMlProvider],
    },
  ],
  controllers: [ScoringController, ScoringAdminController, StartupAssessmentController],
  exports: [ScoringService],
})
export class ScoringModule {}
