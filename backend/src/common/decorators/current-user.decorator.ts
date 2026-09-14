import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

/** Pulls the authenticated user (attached by JwtStrategy.validate) off the
 * request — the single place every controller reads "who is calling". */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
