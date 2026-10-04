import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { HistoricalReviewStatus, ScoreDataSource, UserRole } from "../common/enums";
import { HistoricalSubmissionService } from "./historical-submission.service";
import { FeatureApplicabilityService } from "./feature-applicability.service";
import { OutcomeCoverageService } from "./outcome-coverage.service";
import { HistoricalSnapshotBuilder } from "./historical/historical-snapshot-builder.service";
import { StartupIdentityMatchingService } from "./historical/startup-identity-matching.service";
import { MlReadinessDashboardService } from "./ml-readiness-dashboard.service";
import { AttestCoverageDto, DeclareApplicabilityDto, ReviewHistoricalEntryDto, RevokeDto, SetFoundedBasisDto, SetTrainingEligibilityDto, SubmitHistoricalEntryDto } from "./dto/readiness-v2.dto";

/** Admin-only Readiness V2 tooling: the historical-entry review queue,
 * applicability declarations, per-family coverage attestations, snapshot
 * training eligibility, founding-year basis, and the readiness dashboard.
 * Same guard stack as every other ml-data controller. */
@ApiTags("ml-data")
@ApiCookieAuth()
@Controller("ml-data/historical")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class ReadinessAdminController {
  constructor(
    private readonly submissions: HistoricalSubmissionService,
    private readonly applicability: FeatureApplicabilityService,
    private readonly coverage: OutcomeCoverageService,
    private readonly builder: HistoricalSnapshotBuilder,
    private readonly matching: StartupIdentityMatchingService,
    private readonly dashboard: MlReadinessDashboardService,
  ) {}

  // ---- Review queue ----

  @Get("submissions")
  queue(@Query("status") status?: HistoricalReviewStatus) {
    return this.submissions.queue(status && Object.values(HistoricalReviewStatus).includes(status) ? status : HistoricalReviewStatus.PENDING_REVIEW);
  }

  @Get("submissions/:id")
  detail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.submissions.detail(id);
  }

  @Post("submissions/:id/review")
  review(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: ReviewHistoricalEntryDto, @CurrentUser() user: AuthUser) {
    return this.submissions.review(id, user, dto.action, { notes: dto.notes, documentValidated: dto.documentValidated, confirmNotDuplicate: dto.confirmNotDuplicate });
  }

  /** An admin entering historical data directly (stored as ADMIN_ENTERED, reviewed by themselves). */
  @Post("startups/:id/entries")
  adminEntry(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: SubmitHistoricalEntryDto, @CurrentUser() user: AuthUser) {
    return this.submissions.submit(id, user, dto);
  }

  // ---- Feature applicability ----

  @Get("startups/:id/applicability")
  listApplicability(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.applicability.list(id);
  }

  @Post("startups/:id/applicability")
  declareApplicability(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: DeclareApplicabilityDto, @CurrentUser() user: AuthUser) {
    return this.applicability.declare({ startupId: id, featureKey: dto.featureKey, status: dto.status, effectiveDate: dto.effectiveDate, reason: dto.reason, source: dto.source ?? ScoreDataSource.ADMIN_ENTERED, verified: dto.verified, sourceDocumentId: dto.sourceDocumentId, createdBy: user.userId });
  }

  @Post("applicability/:rowId/revoke")
  revokeApplicability(@Param("rowId", new ParseUUIDPipe()) rowId: string, @Body() dto: RevokeDto) {
    return this.applicability.revoke(rowId, dto.reason);
  }

  // ---- Per-family outcome coverage ----

  @Get("coverage")
  listCoverage(@Query("startupId") startupId?: string) {
    return this.coverage.list(startupId);
  }

  @Post("startups/:id/coverage")
  attestCoverage(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: AttestCoverageDto, @CurrentUser() user: AuthUser) {
    return this.coverage.attest({ startupId: id, ...dto, verifiedBy: user.userId, createdBy: user.userId });
  }

  @Post("coverage/:rowId/revoke")
  revokeCoverage(@Param("rowId", new ParseUUIDPipe()) rowId: string, @Body() dto: RevokeDto) {
    return this.coverage.revoke(rowId, dto.reason);
  }

  // ---- Snapshot eligibility / startup data quality ----

  @Patch("snapshots/:snapshotId/training-eligibility")
  setEligibility(@Param("snapshotId", new ParseUUIDPipe()) snapshotId: string, @Body() dto: SetTrainingEligibilityDto) {
    return this.builder.setTrainingEligibility(snapshotId, dto.eligibility, dto.reason);
  }

  @Patch("startups/:id/founded-basis")
  setFoundedBasis(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: SetFoundedBasisDto) {
    return this.matching.correctFoundedBasis(id, dto.basis, dto.reason);
  }

  // ---- Dashboard ----

  @Get("readiness-dashboard")
  readinessDashboard() {
    return this.dashboard.dashboard();
  }
}
