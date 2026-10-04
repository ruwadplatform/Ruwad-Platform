import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { EntityKind } from "../common/enums";
import { StartupAssessmentService } from "./startup-assessment.service";

/** The founder's own assessment (RUWĀD Score + Predictive Intelligence). Login is required; OwnershipGuard then lets admins through and
 * everyone else only for a startup they own — an unrelated signed-in user gets 403, an anonymous caller 401. Never reachable from the
 * public startup profile, which has no route to any of this. */
@ApiTags("scoring")
@ApiCookieAuth()
@Controller("startups/:id/assessment")
@UseGuards(JwtAuthGuard, OwnershipGuard)
@OwnedEntity(EntityKind.STARTUP)
export class StartupAssessmentController {
  constructor(private readonly assessment: StartupAssessmentService) {}

  @Get()
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.assessment.get(id);
  }
}
