import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { StartupsService } from "./startups.service";
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
  constructor(private readonly service: StartupsService) {}

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

  @Delete(":id")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
