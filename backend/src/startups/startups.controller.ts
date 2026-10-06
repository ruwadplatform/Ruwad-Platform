import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { StartupsService } from "./startups.service";
import { StartupProfileEditService } from "./startup-profile-edit.service";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { CreateStartupDto } from "./dto/create-startup.dto";
import { UpdateStartupDto } from "./dto/update-startup.dto";
import { QueryStartupsDto } from "./dto/query-startups.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { UserRole, EntityKind } from "../common/enums";

@ApiTags("startups")
@Controller("startups")
export class StartupsController {
  constructor(private readonly service: StartupsService, private readonly profileEdit: StartupProfileEditService) {}

  @Get()
  findAll(@Query() query: QueryStartupsDto) {
    return this.service.findAll(query);
  }

  @Get(":slug")
  findOne(@Param("slug") slug: string) {
    return this.service.findBySlugOrThrow(slug);
  }

  @Post()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FOUNDER, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateStartupDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(UserRole.FOUNDER, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  @OwnedEntity(EntityKind.STARTUP)
  update(@Param("id") id: string, @Body() dto: UpdateStartupDto) {
    return this.service.update(id, dto);
  }

  /** The live profile in the same shape as the submission form, to pre-fill the owner's edit page. */
  @Get(":id/edit")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(UserRole.FOUNDER, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  @OwnedEntity(EntityKind.STARTUP)
  editPayload(@Param("id") id: string) {
    return this.profileEdit.getEditPayload(id);
  }

  /** Saves an edit to a live startup in place, then rescores it and refreshes the ML estimate from whatever is on file. */
  @Put(":id/edit")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(UserRole.FOUNDER, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  @OwnedEntity(EntityKind.STARTUP)
  applyEdit(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() payload: Record<string, unknown>) {
    return this.profileEdit.applyEdit(id, user.userId, payload);
  }

  @Delete(":id")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
