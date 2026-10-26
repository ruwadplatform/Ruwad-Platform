import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdvisoryAdminService } from "./advisory-admin.service";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { AdvisoryApplicationsService } from "./advisory-applications.service";
import { AdvisoryAutomationService } from "./advisory-automation.service";
import { AdvisoryBookingsService } from "./advisory-bookings.service";
import { AdvisoryAttendanceService } from "./advisory-attendance.service";
import { AdvisoryMeetingService } from "./advisory-meeting.service";
import { AdvisoryAdvisor } from "./advisory.entities";
import { AdvisoryEnabledGuard, ApprovedAdvisorGuard, CurrentAdvisor } from "./advisory.guards";
import {
  BookingListQueryDto, OutcomeDto, PresenceDto, CreateBookingDto, CreateServiceDto, DatesQueryDto, NoteDto, ProposeRescheduleDto, ReasonDto, ReviewAdvisorDto, SetAvailabilityDto,
  SlotQueryDto, TimeOffDto, UpdateAdvisorProfileDto, UpdateServiceDto, VerificationDto,
} from "./dto/advisory.dto";

type ApplicationUploads = { cv?: Express.Multer.File[]; certificates?: Express.Multer.File[]; photo?: Express.Multer.File[] };
/** Held in memory only long enough to be checked and stored. This stops an oversized upload early; the exact per-type limits are enforced by the service. */
const APPLICATION_UPLOAD = FileFieldsInterceptor([{ name: "cv", maxCount: 2 }, { name: "certificates", maxCount: 8 }, { name: "photo", maxCount: 2 }], { limits: { fileSize: 2 * 1024 * 1024, files: 12, fields: 4, parts: 20 } });

/** Public: the directory, profiles and open slots. No sign-in needed, exactly as the screens are public. */
@ApiTags("advisory")
@Controller("advisory/advisors")
@UseGuards(AdvisoryEnabledGuard)
export class AdvisoryPublicController {
  constructor(private readonly advisors: AdvisoryAdvisorsService) {}

  @Get() list() { return this.advisors.listPublic(); }
  @Get(":slug") profile(@Param("slug") slug: string) { return this.advisors.getPublicProfile(slug); }
  @Get(":slug/dates") dates(@Param("slug") slug: string, @Query() q: DatesQueryDto) { return this.advisors.publicDates(slug, q.serviceId); }
  @Get(":slug/slots") slots(@Param("slug") slug: string, @Query() q: SlotQueryDto) { return this.advisors.publicSlots(slug, q.serviceId, q.date); }
}

/** A signed-in person's bookings: create, read, cancel, and reschedule by agreement. Who may do what is decided in the service, per booking. */
@ApiTags("advisory")
@Controller("advisory")
@UseGuards(AdvisoryEnabledGuard, JwtAuthGuard)
export class AdvisoryBookingsController {
  constructor(private readonly bookings: AdvisoryBookingsService, private readonly meeting: AdvisoryMeetingService, private readonly attendance: AdvisoryAttendanceService) {}

  @Get("my-startups") myStartups(@CurrentUser() u: AuthUser) { return this.bookings.myStartups(u.userId); }
  @Post("bookings") create(@CurrentUser() u: AuthUser, @Body() dto: CreateBookingDto) { return this.bookings.create(u, dto); }
  @Get("bookings/mine") mine(@CurrentUser() u: AuthUser) { return this.bookings.listMine(u); }
  @Get("bookings/:id") detail(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.detail(u, id); }
  @Post("bookings/:id/cancel") cancel(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.bookings.cancel(u, id, dto.reason); }
  @Get("bookings/:id/reschedule/dates") rescheduleDates(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.rescheduleDates(u, id); }
  @Get("bookings/:id/reschedule/slots") rescheduleSlots(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Query("date") date: string) { return this.bookings.rescheduleSlots(u, id, date ?? ""); }
  @Post("bookings/:id/reschedule") propose(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ProposeRescheduleDto) { return this.bookings.proposeReschedule(u, id, dto); }
  @Post("bookings/:id/reschedule/accept") accept(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.acceptReschedule(u, id); }
  @Post("bookings/:id/reschedule/decline") decline(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: NoteDto) { return this.bookings.declineReschedule(u, id, dto.note); }
  /** The meeting room's state (not open yet / open / ended) and whether the caller can join now. Visible to the booking's participants and administrators. */
  @Get("bookings/:id/meeting") meetingStatus(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.meeting.status(u, id); }
  /** Join the meeting: returns a short-lived, single-room token. Only the advisor and the startup's owner/admin, only for a CONFIRMED booking, only inside the join window. */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post("bookings/:id/meeting/join") joinMeeting(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.meeting.join(u, id); }
  /** A person in a SIMULATED room reports that they joined or left. Refused for real meetings (their attendance comes from the video provider). */
  @Post("bookings/:id/meeting/presence") presence(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PresenceDto) { return this.attendance.recordPresence(u, id, dto.event); }
  /** The advisor, or an administrator, records what happened at a consultation that has ended (it becomes COMPLETED with that outcome). */
  @Post("bookings/:id/outcome") outcome(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OutcomeDto) { return this.attendance.resolveOutcome(u, id, dto.outcome, dto.note); }
  @Post("bookings/:id/reschedule/withdraw") withdraw(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.withdrawReschedule(u, id); }
}

/** The advisor's own dashboard. Applying and reading one's own profile need only a sign-in; everything else needs an APPROVED advisor profile. */
@ApiTags("advisory")
@Controller("advisory/advisor")
@UseGuards(AdvisoryEnabledGuard, JwtAuthGuard)
export class AdvisoryAdvisorController {
  constructor(private readonly advisors: AdvisoryAdvisorsService, private readonly bookings: AdvisoryBookingsService, private readonly applications: AdvisoryApplicationsService) {}

  /** The "Become an Advisor" application. Multipart: the form as JSON in `data`, plus files `cv` (required, PDF), `certificates` (up to 5) and `photo`.
   * One application per account. The profile is created PENDING_REVIEW and stays invisible until an administrator approves it. Files are held in memory
   * only long enough to be checked and stored; the limits here stop an oversized upload early, the exact per-type limits are enforced by the service. */
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post("apply")
  @UseInterceptors(APPLICATION_UPLOAD)
  async apply(@CurrentUser() u: AuthUser, @Body() body: { data?: string }, @UploadedFiles() files: ApplicationUploads = {}) {
    return this.applications.submit(u, body?.data, files ?? {});
  }

  /** Edit & Reapply: the owner of a REJECTED application updates it and submits it again (same multipart shape; the CV on file is kept unless a new one is attached). */
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post("reapply")
  @UseInterceptors(APPLICATION_UPLOAD)
  async reapply(@CurrentUser() u: AuthUser, @Body() body: { data?: string }, @UploadedFiles() files: ApplicationUploads = {}) {
    return this.applications.resubmit(u, body?.data, files ?? {});
  }

  /** Null when the caller has no advisor profile (so the screen can offer "Apply"); otherwise the profile with its review status. */
  @Get("me")
  async me(@CurrentUser() u: AuthUser) {
    const advisor = await this.advisors.findByUser(u.userId);
    if (!advisor) return { advisor: null };
    return { advisor: await this.myView(advisor) };
  }

  @Patch("me")
  async updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateAdvisorProfileDto) {
    const advisor = await this.advisors.findByUser(u.userId);
    if (!advisor) return { advisor: null };
    const saved = await this.advisors.updateProfile(advisor, dto);
    return { advisor: await this.myView(saved) };
  }

  /** The signed-in advisor's own record. `reviewNotes` is shown only when it was written for them (rejection, suspension); an approval note stays internal. */
  private async myView(a: AdvisoryAdvisor) {
    return {
      status: a.status,
      reviewNotes: a.status === "REJECTED" || a.status === "SUSPENDED" ? a.reviewNotes : null,
      affiliationVerified: a.affiliationVerified,
      application: await this.applications.statusFor(a),
      profile: await this.advisors.profileView(a, { includeInactiveServices: true }),
    };
  }

  @UseGuards(ApprovedAdvisorGuard) @Get("bookings") bookingsList(@CurrentAdvisor() a: AdvisoryAdvisor) { return this.bookings.listForAdvisor(a); }
  @UseGuards(ApprovedAdvisorGuard) @Post("bookings/:id/approve") approve(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.approve(u, id); }
  @UseGuards(ApprovedAdvisorGuard) @Post("bookings/:id/reject") reject(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: NoteDto) { return this.bookings.reject(u, id, dto.note); }
  @UseGuards(ApprovedAdvisorGuard) @Post("bookings/:id/complete") complete(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.complete(u, id); }

  @UseGuards(ApprovedAdvisorGuard) @Get("availability") availability(@CurrentAdvisor() a: AdvisoryAdvisor) { return this.advisors.getAvailability(a.id); }
  @UseGuards(ApprovedAdvisorGuard) @Put("availability") setAvailability(@CurrentAdvisor() a: AdvisoryAdvisor, @Body() dto: SetAvailabilityDto) { return this.advisors.setAvailability(a.id, dto); }
  @UseGuards(ApprovedAdvisorGuard) @Post("availability/time-off") addTimeOff(@CurrentAdvisor() a: AdvisoryAdvisor, @Body() dto: TimeOffDto) { return this.advisors.addTimeOff(a.id, dto); }
  @UseGuards(ApprovedAdvisorGuard) @Delete("availability/time-off/:id") removeTimeOff(@CurrentAdvisor() a: AdvisoryAdvisor, @Param("id", ParseUUIDPipe) id: string) { return this.advisors.removeTimeOff(a.id, id); }

  @UseGuards(ApprovedAdvisorGuard) @Get("services") services(@CurrentAdvisor() a: AdvisoryAdvisor) { return this.advisors.listServices(a.id); }
  @UseGuards(ApprovedAdvisorGuard) @Post("services") createService(@CurrentAdvisor() a: AdvisoryAdvisor, @Body() dto: CreateServiceDto) { return this.advisors.createService(a.id, dto); }
  @UseGuards(ApprovedAdvisorGuard) @Patch("services/:id") updateService(@CurrentAdvisor() a: AdvisoryAdvisor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) { return this.advisors.updateService(a.id, id, dto); }
  @UseGuards(ApprovedAdvisorGuard) @Delete("services/:id") deactivateService(@CurrentAdvisor() a: AdvisoryAdvisor, @Param("id", ParseUUIDPipe) id: string) { return this.advisors.deactivateService(a.id, id); }
}

/** Administrator-only. RUWAD_ADMIN and SUPER_ADMIN, via the same RolesGuard every other admin route uses. */
@ApiTags("advisory")
@Controller("advisory/admin")
@UseGuards(AdvisoryEnabledGuard, JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class AdvisoryAdminController {
  constructor(
    private readonly admin: AdvisoryAdminService,
    private readonly advisors: AdvisoryAdvisorsService,
    private readonly bookings: AdvisoryBookingsService,
    private readonly automation: AdvisoryAutomationService,
    private readonly applications: AdvisoryApplicationsService,
  ) {}

  /** Advisor applications: the list (filter by ?status=PENDING_REVIEW|APPROVED|REJECTED, none = all), one application in full, and its documents. Decisions use the advisor routes below. */
  @Get("applications") listApplications(@Query("status") status?: string) { return this.applications.listForAdmin(status); }
  @Get("applications/:id") application(@Param("id", ParseUUIDPipe) id: string) { return this.applications.detailForAdmin(id); }
  /** Always a download (never rendered from this origin), never cached, and only for an administrator. */
  @Get("applications/:id/documents/:docId") async document(@Param("id", ParseUUIDPipe) id: string, @Param("docId", ParseUUIDPipe) docId: string, @Res() res: Response) {
    const f = await this.applications.documentFor(id, docId);
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.attachment(f.fileName);
    res.send(f.data);
  }

  @Get("advisors") listAdvisors(@Query("status") status?: string) { return this.admin.listAdvisors(status); }
  @Get("advisors/:id") getAdvisor(@Param("id", ParseUUIDPipe) id: string) { return this.admin.getAdvisor(id); }
  @Post("advisors/:id/approve") approve(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewAdvisorDto) { return this.admin.review(id, "approve", u.userId, dto.notes); }
  @Post("advisors/:id/reject") reject(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewAdvisorDto) { return this.admin.review(id, "reject", u.userId, dto.notes); }
  @Post("advisors/:id/suspend") suspend(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewAdvisorDto) { return this.admin.review(id, "suspend", u.userId, dto.notes); }
  @Patch("advisors/:id/verification") verification(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VerificationDto) { return this.admin.setAffiliationVerified(id, dto.affiliationVerified, u.userId); }

  @Put("advisors/:id/availability") setAvailability(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetAvailabilityDto) { return this.advisors.byIdOrThrow(id).then((a) => this.advisors.setAvailability(a.id, dto)); }
  @Post("advisors/:id/services") createService(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateServiceDto) { return this.advisors.byIdOrThrow(id).then((a) => this.advisors.createService(a.id, dto)); }
  @Patch("advisors/:id/services/:serviceId") updateService(@Param("id", ParseUUIDPipe) id: string, @Param("serviceId", ParseUUIDPipe) serviceId: string, @Body() dto: UpdateServiceDto) { return this.advisors.byIdOrThrow(id).then((a) => this.advisors.updateService(a.id, serviceId, dto)); }

  @Get("bookings") listBookings(@Query() q: BookingListQueryDto) { return this.bookings.listAdmin(q); }
  @Get("bookings/:id") booking(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.detail(u, id); }
  /** An administrator can cancel any booking. There is deliberately no admin approve, confirm or reschedule-accept: those belong to the two parties. */
  @Post("bookings/:id/cancel") cancel(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.bookings.cancel(u, id, dto.reason); }

  /** The scheduler's settings and its last pass. The scheduler itself is OFF unless ADVISORY_SCHEDULER_ENABLED=true. */
  @Get("automation/status") automationStatus() { return this.automation.status(); }
  /** One automation pass by hand. A DRY RUN by default (reports what it would do and changes nothing); pass ?dryRun=false to actually run it. */
  @Post("automation/run") runAutomation(@Query("dryRun") dryRun?: string) { return this.automation.runOnce(new Date(), { dryRun: dryRun !== "false" }); }

  @Get("stats") stats(@Query("includeDemo") includeDemo?: string) { return this.admin.stats(includeDemo === "true"); }
}

/** Daily's webhook. Public (Daily can't sign in), so the signature on the raw body is the only thing that lets a request through; see
 * AdvisoryAttendanceService.handleDailyWebhook. 404 unless DAILY_WEBHOOK_SECRET is set. */
@ApiTags("advisory")
@Controller("advisory/webhooks")
@UseGuards(AdvisoryEnabledGuard)
export class AdvisoryWebhookController {
  constructor(private readonly attendance: AdvisoryAttendanceService) {}

  @Post("daily")
  @HttpCode(200)
  daily(@Req() req: { rawBody?: Buffer }, @Headers() headers: Record<string, string | string[] | undefined>) { return this.attendance.handleDailyWebhook(req.rawBody, headers); }
}
