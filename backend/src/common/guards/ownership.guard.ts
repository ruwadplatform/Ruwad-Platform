import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OWNED_ENTITY_KIND_KEY } from "../decorators/owned-entity.decorator";
import { UserRole } from "../enums";
import { OrganizationsService } from "../../organizations/organizations.service";

/** Runs after JwtAuthGuard + RolesGuard — for a route marked @OwnedEntity(kind),
 * admins pass unconditionally; anyone else must own the specific record named
 * by the ":id" route param (checked via entity_memberships), never just hold
 * a role that could edit *some* record of that kind. */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private organizations: OrganizationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.getAllAndOverride<string>(OWNED_ENTITY_KIND_KEY, [context.getHandler(), context.getClass()]);
    if (!kind) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;
    if (user.role === UserRole.RUWAD_ADMIN || user.role === UserRole.SUPER_ADMIN) return true;
    const entityId = request.params?.id;
    const owns = await this.organizations.isOwner(user.userId, kind as any, entityId);
    if (!owns) throw new ForbiddenException("You do not own this listing");
    return true;
  }
}
