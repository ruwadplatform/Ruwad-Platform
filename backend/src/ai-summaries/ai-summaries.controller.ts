import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiSummariesService } from "./ai-summaries.service";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums";

/** GET /api/ai-summaries/:type/:id — type is startups | investors | hubs | multinationals, id is the organization's slug (or UUID).
 * Signed-in users only: the endpoint can trigger a paid AI call, and it exposes nothing the public profile endpoints don't already. */
@ApiTags("ai-summaries")
@Controller("ai-summaries")
export class AiSummariesController {
  constructor(private readonly service: AiSummariesService) {}

  @Get(":type/:id")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  get(@Param("type") type: string, @Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(type, id, { admin: user.role === UserRole.RUWAD_ADMIN || user.role === UserRole.SUPER_ADMIN });
  }
}
