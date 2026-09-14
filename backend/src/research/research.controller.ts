import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { ResearchService } from "./research.service";
import { CreateResearchDto } from "./dto/create-research.dto";
import { UpdateResearchDto } from "./dto/update-research.dto";
import { QueryResearchDto } from "./dto/query-research.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { UserRole, EntityKind } from "../common/enums";

@ApiTags("research")
@Controller("research")
export class ResearchController {
  constructor(private readonly service: ResearchService) {}

  @Get() findAll(@Query() query: QueryResearchDto) { return this.service.findAll(query); }
  @Get(":slug") findOne(@Param("slug") slug: string) { return this.service.findBySlugOrThrow(slug); }

  @Post()
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateResearchDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  @OwnedEntity(EntityKind.RESEARCH)
  update(@Param("id") id: string, @Body() dto: UpdateResearchDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) { return this.service.remove(id); }
}
