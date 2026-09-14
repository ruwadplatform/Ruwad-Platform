import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { ReportsService } from "./reports.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { PaginationQueryDto } from "../common/pagination.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get() findAll(@Query() query: PaginationQueryDto & { category?: string }) { return this.service.findAll(query); }
  @Get(":slug") findOne(@Param("slug") slug: string) { return this.service.findBySlugOrThrow(slug); }

  @Post()
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateReportDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateReportDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) { return this.service.remove(id); }
}
