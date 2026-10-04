import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { MlCoverageService } from "./ml-coverage.service";
import { MlDataQualityService } from "./ml-data-quality.service";
import { MlClassBalanceService } from "./ml-class-balance.service";
import { MlReadinessService } from "./ml-readiness.service";
import { MlDatasetExportService, rowsToCsv } from "./ml-dataset-export.service";
import { MlSnapshotService } from "./ml-snapshot.service";
import { TARGET_REGISTRY } from "./labels/target-registry";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";

/** Admin-only ML dataset readiness reports and exports. Every route here is
 * internal tooling for judging/preparing training data — never exposed on
 * the public API, never triggers training itself (see docs/
 * ml-data-methodology.md). */
@ApiTags("ml-data")
@ApiCookieAuth()
@Controller("ml-data")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class MlDataController {
  constructor(
    private readonly coverage: MlCoverageService,
    private readonly quality: MlDataQualityService,
    private readonly classBalance: MlClassBalanceService,
    private readonly readiness: MlReadinessService,
    private readonly exporter: MlDatasetExportService,
    private readonly snapshots: MlSnapshotService,
  ) {}

  @Get("targets")
  targets() {
    return TARGET_REGISTRY.map(({ name, group, targetVersion, windowMonths, valueType }) => ({ name, group, targetVersion, windowMonths, valueType }));
  }

  @Get("coverage")
  startupCoverage() {
    return this.coverage.report();
  }

  @Get("quality/feature-coverage")
  featureCoverage() {
    return this.quality.featureCoverage();
  }

  @Get("quality/issues")
  qualityIssues() {
    return this.quality.dataQualityIssues();
  }

  /** Default = V2 (training-eligible snapshots, coverage-enforced labels). `?version=1` reproduces the original all-snapshots counts for comparison only. */
  @Get("class-balance")
  classBalanceAll(@Query("version") version?: string) {
    return this.classBalance.forAllTargets(new Date(), version === "1" ? "V1" : "V2");
  }

  @Get("class-balance/:target")
  classBalanceOne(@Param("target") target: string, @Query("version") version?: string) {
    return this.classBalance.forTarget(target, new Date(), version === "1" ? "V1" : "V2");
  }

  /** Readiness V2 — the report the training gate reads (`readinessVersion: 2`). */
  @Get("readiness/:target")
  readinessFor(@Param("target") target: string) {
    return this.readiness.forTarget(target);
  }

  /** Readiness V1, kept only for before/after comparison. Never read by the training gate. */
  @Get("readiness-v1/:target")
  readinessV1For(@Param("target") target: string) {
    return this.readiness.forTargetV1(target);
  }

  @Get("export")
  async exportDataset(
    @Res() res: Response,
    @Query("target") target: string,
    @Query("format") format: "csv" | "json" = "csv",
    @Query("minConfidence") minConfidence?: string,
    @Query("verifiedOnly") verifiedOnly?: string,
    @Query("includeIdentifiers") includeIdentifiers?: string,
    @Query("includeImmature") includeImmature?: string,
    @Query("includeAnalysisOnly") includeAnalysisOnly?: string,
    @Query("includeExcluded") includeExcluded?: string,
  ) {
    const rows = await this.exporter.exportForTarget({
      targetName: target,
      minConfidence: minConfidence !== undefined ? Number(minConfidence) : undefined,
      verifiedOnly: verifiedOnly === "true",
      includeIdentifiers: includeIdentifiers !== "false",
      includeImmature: includeImmature === "true",
      // Off unless explicitly requested: ANALYSIS_ONLY (e.g. legacy outcome-aware) and EXCLUDED snapshots never enter the default training export.
      includeAnalysisOnly: includeAnalysisOnly === "true",
      includeExcluded: includeExcluded === "true",
    });

    const filename = `ruwad-ml-${target}-${new Date().toISOString().slice(0, 10)}.${format}`;
    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(rows, null, 2));
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(rowsToCsv(rows));
  }

  /** Never auto-run — same shape as POST /scoring/admin/backfill. */
  @Post("snapshot-backfill")
  snapshotBackfill() {
    return this.snapshots.backfillAll();
  }

  @Post("startups/:id/snapshot")
  forceSnapshot(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.snapshots.forceSnapshotForStartup(id);
  }
}
