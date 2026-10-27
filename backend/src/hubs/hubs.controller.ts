import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { HubsService } from "./hubs.service";
import { CreateHubDto } from "./dto/create-hub.dto";
import { UpdateHubDto } from "./dto/update-hub.dto";
import { QueryHubsDto } from "./dto/query-hubs.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { UserRole, EntityKind } from "../common/enums";
import { Personalized, ViewerCtx } from "../visibility/personalized";
import { Viewer } from "../visibility/viewer";

@ApiTags("hubs")
@Controller("hubs")
export class HubsController {
  constructor(private readonly service: HubsService) {}

  @Get() @Personalized() findAll(@Query() query: QueryHubsDto, @ViewerCtx() viewer: Viewer) { return this.service.findAll(query, viewer); }
  @Get(":slug") @Personalized() findOne(@Param("slug") slug: string, @ViewerCtx() viewer: Viewer) { return this.service.findBySlugOrThrow(slug, viewer); }

  @Post()
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateHubDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  @OwnedEntity(EntityKind.HUB)
  update(@Param("id") id: string, @Body() dto: UpdateHubDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) { return this.service.remove(id); }
}
