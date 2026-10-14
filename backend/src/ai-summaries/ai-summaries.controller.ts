import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiSummariesService } from "./ai-summaries.service";

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
  get(@Param("type") type: string, @Param("id") id: string) {
    return this.service.get(type, id);
  }
}
