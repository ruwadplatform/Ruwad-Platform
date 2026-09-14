import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OrganizationsService } from "./organizations.service";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { UpdateMembershipDto } from "./dto/update-membership.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums";

@ApiTags("organizations")
@Controller("organizations")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("my-listings")
  findMyListings(@CurrentUser() user: AuthUser) {
    return this.organizationsService.findMyListings(user.userId);
  }

  @Post("memberships")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateMembershipDto) {
    return this.organizationsService.create(dto);
  }

  @Patch("memberships/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateMembershipDto) {
    return this.organizationsService.update(user.userId, id, dto);
  }

  @Delete("memberships/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) {
    return this.organizationsService.remove(id);
  }
}
