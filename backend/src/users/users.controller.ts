import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { ActivityService } from "../activity/activity.service";
import { ActivityType } from "../common/enums";

@ApiTags("users")
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller("users/me")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    return this.users.toPublic(await this.users.findByIdOrThrow(user.userId));
  }

  @Patch()
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    const updated = await this.users.updateProfile(user.userId, dto);
    await this.activity.log(user.userId, ActivityType.PROFILE_UPDATED, "Updated your profile", "/profile");
    return this.users.toPublic(updated);
  }

  @Get("settings")
  getSettings(@CurrentUser() user: AuthUser) {
    return this.users.getOrCreateSettings(user.userId);
  }

  @Patch("settings")
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(user.userId, dto);
  }
}
