import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Like JwtAuthGuard, but never rejects: a missing, malformed, tampered or expired token simply leaves `request.user` unset, so the caller is a visitor.
 *  Used only on read endpoints that are public but show more to signed-in viewers. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // handleRequest below already swallows auth failures; this only guards against a strategy throwing outright.
      context.switchToHttp().getRequest().user = undefined;
    }
    return true;
  }

  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false | null): TUser | null {
    return user || null;
  }
}
