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

  /** Requests targeting entities the caller OWNS (EntityMembership role =
   * OWNER) — scoped server-side, so it never lists anyone else's. */
  @Get("owner/requests")
  findOwnerRequests(@CurrentUser() user: AuthUser) {
    return this.dataRoomService.findOwnerRequests(user.userId);
  }

  @Get("status")
  status(@CurrentUser() user: AuthUser, @Query("kind") kind: EntityKind, @Query("entityId") entityId: string) {
    return this.dataRoomService.status(user, kind, entityId);
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

  /** Owner-or-admin review. Any authenticated user can reach this route —
   * the service resolves the request's entity and returns 403 unless the
   * caller is that entity's OWNER or a platform admin. */
  @Patch(":id/review")
  review(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ReviewAccessDto) {
    return this.dataRoomService.review(user, id, dto.status);
  }

  /** Kept for existing admin callers — same service method, same checks. */
  @Patch("admin/:id/review")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  reviewAsAdmin(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ReviewAccessDto) {
    return this.dataRoomService.review(user, id, dto.status);
  }
}
