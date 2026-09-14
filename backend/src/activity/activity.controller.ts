import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { ActivityService } from "./activity.service";

@ApiTags("activity")
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller("activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.activity.findForUser(user.userId);
  }
}
