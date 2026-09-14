import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { WatchlistsService } from "./watchlists.service";
import { ToggleWatchlistDto } from "./dto/toggle-watchlist.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";

@ApiTags("watchlists")
@Controller("watchlist")
@UseGuards(JwtAuthGuard)
export class WatchlistsController {
  constructor(private readonly watchlistsService: WatchlistsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.watchlistsService.findForUserResolved(user.userId);
  }

  @Post("toggle")
  async toggle(@CurrentUser() user: AuthUser, @Body() dto: ToggleWatchlistDto) {
    const entityId = dto.entityId ?? (await this.watchlistsService.resolveEntityId(dto.kind, dto.slug!));
    return this.watchlistsService.toggle(user.userId, dto.kind, entityId);
  }
}
