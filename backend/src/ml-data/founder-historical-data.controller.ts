import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { EntityKind, UserRole } from "../common/enums";
import { HistoricalSubmissionService } from "./historical-submission.service";
import { ResubmitHistoricalEntryDto, SubmitHistoricalEntryDto } from "./dto/readiness-v2.dto";
import type { HistoricalSubmission } from "./historical-submission.entity";

/** What a founder may see of their own entries: their own values and the
 * reviewer's note — never the reviewing admin's identity or internal
 * bookkeeping. */
function founderView(s: HistoricalSubmission) {
  return {
    id: s.id, kind: s.kind, payload: s.payload, effectiveDate: s.effectiveDate, reviewStatus: s.reviewStatus, reviewNotes: s.reviewNotes ?? null,
    supportingDocumentId: s.supportingDocumentId ?? null, supportingDocumentType: s.supportingDocumentType ?? null, founderNote: s.founderNote ?? null,
    submittedAt: s.createdAt, reviewedAt: s.reviewedAt ?? null,
  };
}

/** The founder's OPTIONAL "Historical Performance" section. Private by
 * default: every route is owner-or-admin only (same OwnershipGuard as editing
 * the listing), nothing here is part of any public startup payload, and
 * responses are never cached. A founder can add, revise and withdraw entries;
 * they cannot set a source, mark anything verified, or approve anything —
 * entries wait for admin review and affect no snapshot or label until then. */
@ApiTags("startups")
@ApiCookieAuth()
@Controller("startups/:id/historical-data")
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles(UserRole.FOUNDER, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
@OwnedEntity(EntityKind.STARTUP)
export class FounderHistoricalDataController {
  constructor(private readonly submissions: HistoricalSubmissionService) {}

  /** Vocabulary for the form (the company's own regulatory ladder, metric types, currencies...). */
  @Get("options")
  @Header("Cache-Control", "private, no-store")
  options(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.submissions.options(id);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@Param("id", new ParseUUIDPipe()) id: string) {
    return (await this.submissions.listForStartup(id)).map(founderView);
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  async submit(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: SubmitHistoricalEntryDto, @CurrentUser() user: AuthUser) {
    return founderView(await this.submissions.submit(id, user, dto));
  }

  /** Revise an entry that was sent back for correction (or is still pending). */
  @Put(":entryId")
  @Header("Cache-Control", "private, no-store")
  async resubmit(@Param("id", new ParseUUIDPipe()) id: string, @Param("entryId", new ParseUUIDPipe()) entryId: string, @Body() dto: ResubmitHistoricalEntryDto, @CurrentUser() user: AuthUser) {
    return founderView(await this.submissions.resubmit(id, entryId, user, dto));
  }

  @Delete(":entryId")
  @HttpCode(204)
  async withdraw(@Param("id", new ParseUUIDPipe()) id: string, @Param("entryId", new ParseUUIDPipe()) entryId: string) {
    await this.submissions.withdraw(id, entryId);
  }
}
