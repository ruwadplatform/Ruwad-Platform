import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UsersService } from "../users/users.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";

const COOKIE_NAME = "ruwad_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  private setAuthCookie(res: Response, token: string) {
    const isProd = this.config.get("NODE_ENV") === "production";
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      // Frontend and backend live on different Render domains in
      // production, so the cookie must be sendable cross-site; "lax" is
      // used in dev since localhost-to-localhost doesn't need it.
      sameSite: isProd ? "none" : "lax",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });
  }

  @Post("register")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto);
    const token = this.auth.signToken(user);
    this.setAuthCookie(res, token);
    return this.users.toPublic(user);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateCredentials(dto);
    const token = this.auth.signToken(user);
    this.setAuthCookie(res, token);
    return this.users.toPublic(user);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  async me(@CurrentUser() user: AuthUser) {
    return this.users.toPublic(await this.users.findByIdOrThrow(user.userId));
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return { success: true };
  }
}
