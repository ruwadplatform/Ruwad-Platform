import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

const COOKIE_NAME = "ruwad_token";

/** Reads the JWT from the httpOnly cookie set at login (falls back to a
 * Bearer header so Swagger's "Authorize" and API testing tools still work)
 * — the frontend never touches the token directly, no localStorage. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[COOKIE_NAME] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
