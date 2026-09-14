import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DataRoomService } from "./data-room.service";
import { RequestAccessDto } from "./dto/request-access.dto";
import { ReviewAccessDto } from "./dto/review-access.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole, EntityKind } from "../common/enums";

@ApiTags("data-room")
@Controller("data-room")
@UseGuards(JwtAuthGuard)
export class DataRoomController {
  constructor(private readonly dataRoomService: DataRoomService) {}

  @Get("my-access")
  findMine(@CurrentUser() user: AuthUser) {
    return this.dataRoomService.findForUser(user.userId);
  }

  @Get("status")
  status(@CurrentUser() user: AuthUser, @Query("kind") kind: EntityKind, @Query("entityId") entityId: string) {
    return this.dataRoomService.status(user.userId, kind, entityId);
  }

  @Post("request")
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestAccessDto) {
    return this.dataRoomService.requestAccess(user.userId, dto.kind, dto.entityId);
  }

  @Get("admin/pending")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  findAllPending() {
    return this.dataRoomService.findAllPending();
  }

  @Patch("admin/:id/review")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  review(@Param("id") id: string, @Body() dto: ReviewAccessDto) {
    return this.dataRoomService.review(id, dto.status);
  }
}
