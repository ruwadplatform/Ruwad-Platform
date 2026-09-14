import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { UserRole } from "../enums";

/** Runs after JwtAuthGuard (which populates req.user) — checks the
 * authenticated user's role against @Roles(...) metadata on the route.
 * A route with no @Roles() decorator is allowed through unchanged. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    return !!user && required.includes(user.role);
  }
}
