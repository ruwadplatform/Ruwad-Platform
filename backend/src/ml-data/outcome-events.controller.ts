import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { OutcomeEventsService } from "./outcome-events.service";
import { CreateOutcomeEventDto } from "./dto/create-outcome-event.dto";
import { CorrectOutcomeEventDto } from "./dto/correct-outcome-event.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums";

/** Admin-only outcome-event entry — mirrors ScoringController's
 * controller-level guard pattern. Never reaches the public startup API;
 * these are ML training-data internals. */
@ApiTags("ml-data")
@ApiCookieAuth()
@Controller("ml-data/startups/:id/outcomes")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class OutcomeEventsController {
  constructor(private readonly outcomes: OutcomeEventsService) {}

  @Get()
  list(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.outcomes.listForStartup(id);
  }

  @Patch(":eventId")
  correct(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Param("eventId", new ParseUUIDPipe()) eventId: string, @Body() dto: CorrectOutcomeEventDto) {
    return this.outcomes.correctValueText(id, eventId, dto.valueText, dto.reason, user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: CreateOutcomeEventDto) {
    return this.outcomes.createAdminEvent(id, dto, user.userId);
  }
}
