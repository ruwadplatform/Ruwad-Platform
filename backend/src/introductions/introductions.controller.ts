import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IntroductionsService } from "./introductions.service";
import { CreateIntroductionDto } from "./dto/create-introduction.dto";
import { UpdateIntroductionStatusDto } from "./dto/update-introduction-status.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums";

@ApiTags("introductions")
@Controller("introductions")
@UseGuards(JwtAuthGuard)
export class IntroductionsController {
  constructor(private readonly introductionsService: IntroductionsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.introductionsService.findForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIntroductionDto) {
    return this.introductionsService.create(user.userId, dto);
  }

  @Get("admin/all")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  findAllAdmin() {
    return this.introductionsService.findAll();
  }

  @Get(":id")
  async findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.introductionsService.findOwnedOrThrow(user.userId, id);
  }

  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  updateStatus(@Param("id") id: string, @Body() dto: UpdateIntroductionStatusDto) {
    return this.introductionsService.updateStatus(id, dto.status);
  }
}
