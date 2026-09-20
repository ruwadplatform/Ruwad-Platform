import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { NewsService } from "./news.service";
import { CreateNewsDto } from "./dto/create-news.dto";
import { UpdateNewsDto } from "./dto/update-news.dto";
import { NewsQueryDto } from "./dto/news-query.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";

@ApiTags("news")
@Controller("news")
export class NewsController {
  constructor(private readonly service: NewsService) {}

  @Get() findAll(@Query() query: NewsQueryDto) { return this.service.findAll(query); }
  @Get(":id") findOne(@Param("id") id: string) { return this.service.findByIdOrThrow(id); }

  @Post()
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateNewsDto) { return this.service.create(dto); }

  @Patch(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateNewsDto) { return this.service.update(id, dto); }

  @Delete(":id")
  @ApiCookieAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) { return this.service.remove(id); }
}
