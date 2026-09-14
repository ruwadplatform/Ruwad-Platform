import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SavedSearchesService } from "./saved-searches.service";
import { CreateSavedSearchDto } from "./dto/create-saved-search.dto";
import { UpdateSavedSearchDto } from "./dto/update-saved-search.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";

@ApiTags("saved-searches")
@Controller("saved-searches")
@UseGuards(JwtAuthGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.savedSearchesService.findForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSavedSearchDto) {
    return this.savedSearchesService.create(user.userId, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateSavedSearchDto) {
    return this.savedSearchesService.update(user.userId, id, dto);
  }

  @Post(":id/run")
  markRun(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.savedSearchesService.markRun(user.userId, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.savedSearchesService.remove(user.userId, id);
  }
}
