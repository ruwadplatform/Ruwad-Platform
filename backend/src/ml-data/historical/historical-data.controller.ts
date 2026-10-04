import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import * as fs from "fs/promises";
import type { Response } from "express";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "../../common/enums";
import { historicalCsvUploadOptions, HistoricalCsvUploadFilter } from "./historical-csv-upload";
import { HistoricalImportBatchService } from "./historical-import-batch.service";
import { HistoricalEvidenceService } from "./historical-evidence.service";
import { StartupIdentityMatchingService } from "./startup-identity-matching.service";
import { HistoricalSnapshotBuilder } from "./historical-snapshot-builder.service";
import { HistoricalCohortService } from "./historical-cohort.service";
import { HistoricalDataQualityService } from "./historical-data-quality.service";
import { historicalFeatureTemplateCsv, historicalIdentityTemplateCsv, historicalOutcomeTemplateCsv } from "./historical-csv-templates";
import { UploadHistoricalBatchDto } from "./dto/upload-historical-batch.dto";
import { CreateCohortDto } from "./dto/create-cohort.dto";
import { AddCohortMemberDto } from "./dto/add-cohort-member.dto";
import { BulkSnapshotDto, TagSelectionMethodDto } from "./dto/bulk-snapshot.dto";
import { LeaveUnresolvedDto, ResolveConflictDto } from "./dto/resolve-conflict.dto";
import { ConfirmMatchDto, CorrectStartupCategoryDto, CreateStartupForIdentityDto } from "./dto/match-review.dto";

/** Admin-only — same guard stack as every other ml-data controller. Model
 * metadata, evidence sources and match candidates are internal research
 * tooling, never exposed publicly. */
@ApiTags("ml-data")
@ApiCookieAuth()
@Controller("ml-data/historical")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class HistoricalDataController {
  constructor(
    private readonly batches: HistoricalImportBatchService,
    private readonly evidence: HistoricalEvidenceService,
    private readonly matching: StartupIdentityMatchingService,
    private readonly builder: HistoricalSnapshotBuilder,
    private readonly cohorts: HistoricalCohortService,
    private readonly quality: HistoricalDataQualityService,
  ) {}

  // ---- Import batches ----

  @Get("batches")
  listBatches() {
    return this.batches.list();
  }

  @Get("batches/:id")
  getBatch(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.batches.get(id);
  }

  @Post("batches")
  @UseInterceptors(FileInterceptor("file", historicalCsvUploadOptions()))
  @UseFilters(HistoricalCsvUploadFilter)
  async upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadHistoricalBatchDto, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException("A .csv file is required.");
    const csvText = await fs.readFile(file.path, "utf8");
    await fs.unlink(file.path).catch(() => undefined);
    // Safe-by-default: anything other than the explicit string "false"
    // (including the field being omitted entirely) runs as a dry run —
    // never the other way around.
    return this.batches.process({ csvText, sourceName: dto.sourceName, sourceType: dto.sourceType, fileName: file.originalname, importedBy: user.userId, dryRun: dto.dryRun !== "false" });
  }

  /** Re-runs a previously dry-run batch for real, using the CSV text
   * already stored on the batch row — no re-upload needed. */
  @Post("batches/:id/commit")
  async commit(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    const batch = await this.batches.get(id);
    return this.batches.process({ csvText: batch.rawCsv, sourceName: batch.sourceName, sourceType: batch.sourceType, fileName: batch.fileName, importedBy: user.userId, dryRun: false });
  }

  @Post("batches/:id/retry")
  retryPending(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.batches.retryPendingRows(id, user.userId);
  }

  // ---- Identity match review ----

  @Get("identities")
  listIdentitiesNeedingReview() {
    return this.matching.listNeedingReview();
  }

  @Post("identities/:id/confirm")
  confirmMatch(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: ConfirmMatchDto, @CurrentUser() user: AuthUser) {
    return this.matching.confirmMatch(id, dto.startupId, user.userId);
  }

  @Post("identities/:id/create-startup")
  createStartup(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CreateStartupForIdentityDto, @CurrentUser() user: AuthUser) {
    return this.matching.createStartupForIdentity(id, dto, user.userId);
  }

  @Patch("startups/:id/category")
  correctStartupCategory(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CorrectStartupCategoryDto) {
    return this.matching.correctStartupCategory(id, dto.category, dto.reason);
  }

  @Post("identities/:id/reject")
  rejectMatch(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.matching.rejectMatch(id);
  }

  // ---- Evidence conflicts ----

  @Get("evidence/conflicts")
  listConflicts() {
    return this.evidence.listConflicts();
  }

  @Post("evidence/resolve")
  resolveConflict(@Body() dto: ResolveConflictDto, @CurrentUser() user: AuthUser) {
    return this.evidence.resolveConflict(dto.preferredId, user.userId, dto.reason);
  }

  @Post("evidence/:id/leave-unresolved")
  leaveUnresolved(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: LeaveUnresolvedDto, @CurrentUser() user: AuthUser) {
    return this.evidence.leaveUnresolved(id, user.userId, dto.reason);
  }

  // ---- Snapshot preview/build ----

  @Get("startups/:id/snapshot-preview")
  previewSnapshot(@Param("id", new ParseUUIDPipe()) id: string, @Query("snapshotDate") snapshotDate: string) {
    return this.builder.preview(id, snapshotDate);
  }

  @Post("startups/:id/snapshots")
  buildSnapshot(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: BulkSnapshotDto) {
    return this.builder.build(id, dto.snapshotDate, dto.reason ?? "Historical import", { selectionMethod: dto.selectionMethod, minDensity: dto.minDensity });
  }

  @Patch("snapshots/:snapshotId/selection-method")
  tagSnapshotSelectionMethod(@Param("snapshotId", new ParseUUIDPipe()) snapshotId: string, @Body() dto: TagSelectionMethodDto) {
    return this.builder.tagSelectionMethod(snapshotId, dto.selectionMethod);
  }

  // ---- Cohorts ----

  @Get("cohorts")
  listCohorts() {
    return this.cohorts.list();
  }

  @Post("cohorts")
  createCohort(@Body() dto: CreateCohortDto) {
    return this.cohorts.create(dto);
  }

  @Get("cohorts/:id/members")
  listCohortMembers(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cohorts.listMembers(id);
  }

  @Post("cohorts/:id/members")
  addCohortMember(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: AddCohortMemberDto) {
    return this.cohorts.addMember(id, dto.startupId);
  }

  @Post("cohorts/:id/snapshots/preview")
  previewCohortSnapshots(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: BulkSnapshotDto) {
    return this.cohorts.bulkPreview(id, dto.snapshotDate);
  }

  @Post("cohorts/:id/snapshots")
  buildCohortSnapshots(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: BulkSnapshotDto) {
    return this.cohorts.bulkBuild(id, dto.snapshotDate, dto.reason ?? "Historical bulk import");
  }

  // ---- Dashboard ----

  @Get("dashboard")
  dashboard() {
    return this.quality.dashboard();
  }

  // ---- Templates ----

  @Get("templates/features")
  templateFeatures(@Res() res: Response) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ruwad-historical-features-template.csv"');
    res.send(historicalFeatureTemplateCsv());
  }

  @Get("templates/outcomes")
  templateOutcomes(@Res() res: Response) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ruwad-historical-outcomes-template.csv"');
    res.send(historicalOutcomeTemplateCsv());
  }

  @Get("templates/identities")
  templateIdentities(@Res() res: Response) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ruwad-historical-identities-template.csv"');
    res.send(historicalIdentityTemplateCsv());
  }
}
