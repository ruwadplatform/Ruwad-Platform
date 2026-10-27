import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { InvestorsService } from "./investors.service";
import { CreateInvestorDto } from "./dto/create-investor.dto";
import { UpdateInvestorDto } from "./dto/update-investor.dto";
import { QueryInvestorsDto } from "./dto/query-investors.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { UserRole, EntityKind } from "../common/enums";
import { Personalized, ViewerCtx } from "../visibility/personalized";
import { Viewer } from "../visibility/viewer";

@ApiTags("investors")
@Controller("investors")
export class InvestorsController {
  constructor(private readonly service: InvestorsService) {}

  @Get() @Personalized() findAll(@Query() query: QueryInvestorsDto, @ViewerCtx() viewer: Viewer) { return this.service.findAll(query, viewer); }
  @Get(":slug") @Personalized() findOne(@Param("slug") slug: string, @ViewerCtx() viewer: Viewer) { return this.service.findBySlugOrThrow(slug, viewer); }

  @Post()
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INVESTOR, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateInvestorDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(UserRole.INVESTOR, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  @OwnedEntity(EntityKind.INVESTOR)
  update(@Param("id") id: string, @Body() dto: UpdateInvestorDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) { return this.service.remove(id); }
}
