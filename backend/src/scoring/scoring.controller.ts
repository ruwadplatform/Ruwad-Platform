import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { ScoringService } from "./scoring.service";
import { SetScoringFeaturesDto } from "./dto/set-features.dto";
import { VerifyFeaturesDto } from "./dto/verify-features.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { ScoreTrigger, UserRole } from "../common/enums";
import type { ScoringFeatureKey } from "./scoring.types";

/** Admin-only scoring diagnostics and overrides. Guarded at the controller
 * level (mirrors DataRoomController's pattern) — the full per-factor
 * breakdown (reasons, inputs used/missing, provenance) never reaches the
 * public startup profile endpoint; that only ever gets the composite
 * score/status/confidence (see StartupsService.toDetail()). */
@ApiTags("scoring")
@ApiCookieAuth()
@Controller("scoring/startups")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  @Get(":id")
  getScore(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.scoring.getScoreForStartup(id);
  }

  @Get(":id/history")
  getHistory(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.scoring.getScoreHistory(id);
  }

  @Get(":id/features")
  getFeatures(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.scoring.getFeatures(id);
  }

  @Put(":id/features")
  setFeatures(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: SetScoringFeaturesDto) {
    return this.scoring.setFeatures(id, dto.features, dto.source, user.userId, dto.reason);
  }

  @Post(":id/features/verify")
  verifyFeatures(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: VerifyFeaturesDto) {
    // Client-provided keys are trusted the same way SetScoringFeaturesDto's
    // `features` object is: an unrecognized key is simply absent from the
    // stored features/provenance, so verifyFeatures() below is a no-op for it.
    return this.scoring.verifyFeatures(id, dto.keys as ScoringFeatureKey[], user.userId);
  }

  @Post(":id/recalculate")
  recalculate(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.scoring.recalculateStartupScore(id, ScoreTrigger.ADMIN_RECALCULATION);
  }
}

/** Separate controller (not under scoring/startups/:id) for the one route
 * that isn't scoped to a single startup — never auto-run on boot, admin-
 * triggered only, same guard as everything else in this module. */
@ApiTags("scoring")
@ApiCookieAuth()
@Controller("scoring/admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class ScoringAdminController {
  constructor(private readonly scoring: ScoringService) {}

  @Post("backfill")
  backfill() {
    return this.scoring.backfillAll();
  }
}
