import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import { UsersService } from "../users/users.service";
import { emailVerificationRequired } from "./email-verification.config";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

const COOKIE_NAME = "ruwad_token";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the JWT from the httpOnly cookie set at login (falls back to a
 * Bearer header so Swagger's "Authorize" and API testing tools still work)
 * — the frontend never touches the token directly, no localStorage. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /** With EMAIL_VERIFICATION_REQUIRED on, a session also needs a verified address: this is where the rule is enforced for every guarded route. */
  private readonly requireVerified: boolean;

  constructor(config: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[COOKIE_NAME] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET"),
    });
    this.requireVerified = emailVerificationRequired((k) => config.get<string>(k));
  }

  /** A valid signature is not enough: the account must still exist and be ACTIVE, so deleting or suspending someone ends their session immediately
   * instead of when the token expires. A database failure is NOT turned into a 401 (that would sign everyone out during an outage); it surfaces as an error. */
  async validate(payload: JwtPayload) {
    if (typeof payload?.sub !== "string" || !UUID.test(payload.sub)) throw new UnauthorizedException();
    const usable = this.requireVerified ? await this.users.isActiveAndVerified(payload.sub) : await this.users.isActive(payload.sub);
    if (!usable) throw new UnauthorizedException();
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
