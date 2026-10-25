import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdvisoryAdminService } from "./advisory-admin.service";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { AdvisoryBookingsService } from "./advisory-bookings.service";
import { AdvisoryAdvisor } from "./advisory.entities";
import { AdvisoryEnabledGuard, ApprovedAdvisorGuard, CurrentAdvisor } from "./advisory.guards";
import {
  AdvisorProfileDto, BookingListQueryDto, CreateBookingDto, CreateServiceDto, DatesQueryDto, NoteDto, ProposeRescheduleDto, ReasonDto, ReviewAdvisorDto, SetAvailabilityDto,
  SlotQueryDto, TimeOffDto, UpdateAdvisorProfileDto, UpdateServiceDto, VerificationDto,
} from "./dto/advisory.dto";

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
  constructor(private readonly bookings: AdvisoryBookingsService) {}

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
  @Post("bookings/:id/reschedule/withdraw") withdraw(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.withdrawReschedule(u, id); }
}

/** The advisor's own dashboard. Applying and reading one's own profile need only a sign-in; everything else needs an APPROVED advisor profile. */
@ApiTags("advisory")
@Controller("advisory/advisor")
@UseGuards(AdvisoryEnabledGuard, JwtAuthGuard)
export class AdvisoryAdvisorController {
  constructor(private readonly advisors: AdvisoryAdvisorsService, private readonly bookings: AdvisoryBookingsService) {}

  @Post("apply")
  async apply(@CurrentUser() u: AuthUser, @Body() dto: AdvisorProfileDto) {
    const advisor = await this.advisors.apply(u.userId, dto);
    return this.advisors.profileView(advisor, { includeInactiveServices: true }).then((profile) => ({ status: advisor.status, profile }));
  }

  /** Null when the caller has no advisor profile (so the screen can offer "Apply"); otherwise the profile with its review status. */
  @Get("me")
  async me(@CurrentUser() u: AuthUser) {
    const advisor = await this.advisors.findByUser(u.userId);
    if (!advisor) return { advisor: null };
    return { advisor: { status: advisor.status, reviewNotes: advisor.reviewNotes, affiliationVerified: advisor.affiliationVerified, profile: await this.advisors.profileView(advisor, { includeInactiveServices: true }) } };
  }

  @Patch("me")
  async updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateAdvisorProfileDto) {
    const advisor = await this.advisors.findByUser(u.userId);
    if (!advisor) return { advisor: null };
    const saved = await this.advisors.updateProfile(advisor, dto);
    return { advisor: { status: saved.status, reviewNotes: saved.reviewNotes, affiliationVerified: saved.affiliationVerified, profile: await this.advisors.profileView(saved, { includeInactiveServices: true }) } };
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
  constructor(private readonly admin: AdvisoryAdminService, private readonly advisors: AdvisoryAdvisorsService, private readonly bookings: AdvisoryBookingsService) {}

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

  @Get("stats") stats(@Query("includeDemo") includeDemo?: string) { return this.admin.stats(includeDemo === "true"); }
}
