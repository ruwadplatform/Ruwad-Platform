import { Body, Controller, Get, Delete, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { OrganizationsService } from "./organizations.service";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { UpdateMembershipDto } from "./dto/update-membership.dto";
import { CreateListingClaimDto } from "./dto/create-listing-claim.dto";
import { RejectListingClaimDto } from "./dto/reject-listing-claim.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { EntityKind, UserRole } from "../common/enums";

@ApiTags("organizations")
@Controller("organizations")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("my-listings")
  findMyListings(@CurrentUser() user: AuthUser) {
    return this.organizationsService.findMyListings(user.userId);
  }

  @Post("memberships")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateMembershipDto) {
    return this.organizationsService.create(dto);
  }

  @Patch("memberships/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateMembershipDto) {
    return this.organizationsService.update(user.userId, id, dto);
  }

  @Delete("memberships/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) {
    return this.organizationsService.remove(id);
  }

  // ---- listing claims (declared before ":id"-style admin routes wouldn't conflict here, but kept together for clarity) ----

  /** Public: whether a listing already has a claim under review — used to grey out the "Claim" button without exposing who filed it. */
  @Get("claims/pending")
  pendingClaim(@Query("kind") kind: EntityKind, @Query("entityId", new ParseUUIDPipe()) entityId: string) {
    return this.organizationsService.pendingClaimForEntity(kind, entityId).then((pending) => ({ pending }));
  }

  @Get("claims/mine")
  myClaim(@CurrentUser() user: AuthUser) {
    return this.organizationsService.myClaim(user.userId);
  }

  @Post("claims")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submitClaim(@CurrentUser() user: AuthUser, @Body() dto: CreateListingClaimDto) {
    return this.organizationsService.submitClaim(user.userId, dto);
  }

  @Get("claims/admin/all")
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  findAllClaimsAdmin() {
    return this.organizationsService.findAllClaimsAdmin();
  }

  @Post("claims/:id/approve")
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  approveClaim(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.organizationsService.approveClaim(id, user.userId);
  }

  @Post("claims/:id/reject")
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
  rejectClaim(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: RejectListingClaimDto) {
    return this.organizationsService.rejectClaim(id, user.userId, dto.reason);
  }
}
