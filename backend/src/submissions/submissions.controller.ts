import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { promises as fsp } from "fs";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SubmissionsService } from "./submissions.service";
import { PitchDeckUploadFilter, pitchDeckUploadOptions } from "./pitch-deck-upload";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { UpdateSubmissionDto, RequestChangesDto, RejectDto, FindSubmissionsQueryDto } from "./dto/update-submission.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums";

/** Route order matters: every literal "admin/..." path is declared before
 * the generic ":id" routes below it, so NestJS never tries to parse
 * "admin" itself as a submission id. */
@ApiTags("submissions")
@ApiCookieAuth()
@Controller("submissions")
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  // --------------------------------------------------------------- admin
  @Get("admin/all")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  findAllAdmin(@Query() query: FindSubmissionsQueryDto) {
    return this.submissionsService.findAllAdmin(query);
  }

  @Get("admin/kpis")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  kpis() {
    return this.submissionsService.kpis();
  }

  @Get("admin/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  findOneAdmin(@Param("id") id: string) {
    return this.submissionsService.findOneAdmin(id);
  }

  @Get("admin/:id/history")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  historyAdmin(@Param("id") id: string) {
    return this.submissionsService.history(id);
  }

  @Post("admin/:id/start-review")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  startReview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.submissionsService.startReview(user.userId, id);
  }

  @Post("admin/:id/request-changes")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  requestChanges(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: RequestChangesDto) {
    return this.submissionsService.requestChanges(user.userId, id, dto);
  }

  @Post("admin/:id/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.submissionsService.approve(user.userId, id);
  }

  @Post("admin/:id/reject")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: RejectDto) {
    return this.submissionsService.reject(user.userId, id, dto);
  }

  // ---------------------------------------------------------------- user
  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.submissionsService.findForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubmissionDto) {
    return this.submissionsService.create(user.userId, dto);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.submissionsService.findOneForUser(user.userId, id);
  }

  @Get(":id/history")
  history(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    // findOneForUser enforces ownership (throws 403/404) before we let the
    // user see their own submission's review history.
    return this.submissionsService.findOneForUser(user.userId, id).then(() => this.submissionsService.history(id));
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateSubmissionDto) {
    return this.submissionsService.update(user.userId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.submissionsService.remove(user.userId, id);
  }

  @Post(":id/submit")
  submit(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.submissionsService.submit(user.userId, id);
  }

  /** Spends real Anthropic API credits per call, same as /resume-parse —
   * throttled to match. */
  @Post(":id/autofill")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseFilters(PitchDeckUploadFilter)
  @UseInterceptors(FileInterceptor("file", pitchDeckUploadOptions())) // PDF / PPTX, up to 100 MB, streamed to a private temp file
  async autofill(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    try {
      return await this.submissionsService.autofill(user.userId, id, file);
    } finally {
      // The uploaded deck is never kept: remove the temp file whatever the outcome.
      if (file?.path) await fsp.unlink(file.path).catch(() => undefined);
    }
  }
}
