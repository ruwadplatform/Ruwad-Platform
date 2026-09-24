import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { RolesGuard } from "../common/guards/roles.guard";
import { RejectReviewDto, SubmitReportDto } from "./dto/submit-report.dto";
import { MAX_REPORT_PDF_BYTES } from "./report-submission.constants";
import { ReportSubmissionsService, type FileStream } from "./report-submissions.service";

const ADMIN = [UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN];

function sendPdf(res: Response, f: FileStream, cache: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${f.fileName.replace(/["\r\n]/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox"); // a PDF opened from here can't run anything in RUWĀD's origin
  res.setHeader("Cache-Control", cache);
  res.send(f.data);
}

/** User-submitted reports. Declared BEFORE ReportsController in the module so `my-submissions`, `review/...` and
 * `submissions/...` are matched here rather than read as a report slug by `GET /reports/:slug`. */
@ApiTags("report-submissions")
@Controller("reports")
export class ReportSubmissionsController {
  constructor(private readonly service: ReportSubmissionsService) {}

  /* ---- any signed-in user ---- */

  @Post("submissions/file")
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCookieAuth() @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_REPORT_PDF_BYTES, files: 1 } }))
  uploadFile(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.service.saveFile(file, user.userId);
  }

  @Post("submissions")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCookieAuth() @UseGuards(JwtAuthGuard)
  submit(@Body() dto: SubmitReportDto, @CurrentUser() user: AuthUser) {
    return this.service.submit(user.userId, dto);
  }

  @Get("my-submissions")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser) { return this.service.listMine(user.userId); }

  @Get("my-submissions/:id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard)
  mineOne(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.getMine(user.userId, id); }

  @Get("my-submissions/:id/file")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard)
  async mineFile(@Param("id") id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    sendPdf(res, await this.service.ownerFile(user.userId, id), "private, no-store");
  }

  /* ---- admin: monitoring and email retry ---- */

  @Get("submissions/admin")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  adminList() { return this.service.adminList(); }

  @Post("submissions/:id/resend-review-email")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(...ADMIN)
  resend(@Param("id", new ParseUUIDPipe()) id: string) { return this.service.resendReviewEmail(id); }

  /* ---- the emailed review link: no login, identified only by the single-use token ---- */

  @Get("review/:token")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reviewInfo(@Param("token") token: string) { return this.service.reviewInfo(token); }

  @Get("review/:token/file")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reviewFile(@Param("token") token: string, @Res() res: Response) {
    sendPdf(res, await this.service.reviewFile(token), "private, no-store");
  }

  @Post("review/:token/accept")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@Param("token") token: string) { return this.service.decide(token, "ACCEPT"); }

  @Post("review/:token/reject")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reject(@Param("token") token: string, @Body() body: RejectReviewDto) { return this.service.decide(token, "REJECT", body.reason); }

  /* ---- public: the PDF of a PUBLISHED report ---- */

  @Get("file/:fileId")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async publishedFile(@Param("fileId") fileId: string, @Res() res: Response) {
    sendPdf(res, await this.service.publishedFile(fileId), "public, max-age=60");
  }
}
