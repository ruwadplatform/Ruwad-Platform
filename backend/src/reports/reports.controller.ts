import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ReportsService } from "./reports.service";
import { ReportGeneratorService } from "./report-generator.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { GenerateReportDto } from "./dto/generate-report.dto";
import { PaginationQueryDto } from "../common/pagination.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";

const ADMIN = [UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN];

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService, private readonly generator: ReportGeneratorService) {}

  /** Public: published reports only. Viewing never triggers a web search — everything is stored with the report. */
  @Get() findAll(@Query() query: PaginationQueryDto & { category?: string }) { return this.service.findAll(query); }

  // ---- admin (declared before ":slug" so these paths aren't read as a slug) ----
  @Get("admin/all")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  findAllAdmin() { return this.service.findAllAdmin(); }

  @Get("admin/by-slug/:slug")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  findBySlugAdmin(@Param("slug") slug: string) { return this.service.findBySlugAdmin(slug); }

  /** Runs the research (a few Serper searches) and saves a DRAFT report. */
  @Post("generate")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  generate(@Body() dto: GenerateReportDto) {
    return this.generator.generate(dto.kind, { sector: dto.sector, startupSlug: dto.startupSlug });
  }

  /** The ONLY way to run a report's research again (bypasses the cache, spends Serper searches). */
  @Post(":id/refresh-research")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  refresh(@Param("id", new ParseUUIDPipe()) id: string) { return this.generator.refreshResearch(id); }

  @Post(":id/publish")
  @HttpCode(200)
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  publish(@Param("id", new ParseUUIDPipe()) id: string) { return this.service.setPublished(id, true); }

  @Post(":id/unpublish")
  @HttpCode(200)
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  unpublish(@Param("id", new ParseUUIDPipe()) id: string) { return this.service.setPublished(id, false); }

  @Get(":slug") findOne(@Param("slug") slug: string) { return this.service.findBySlugOrThrow(slug); }

  @Post()
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  create(@Body() dto: CreateReportDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateReportDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  remove(@Param("id") id: string) { return this.service.remove(id); }
}
