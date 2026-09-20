import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { GoogleCalendarService } from "./google-calendar.service";

const OAUTH_COOKIE = "ruwad_gcal_oauth";

class ConnectDto {
  @IsOptional() @IsString() @MaxLength(100) returnTo?: string;
}

@ApiTags("calendar")
@ApiCookieAuth()
@Controller("calendar/google")
export class GoogleCalendarController {
  constructor(private readonly google: GoogleCalendarService, private readonly config: ConfigService) {}

  private cookieOptions() {
    const isProd = this.config.get("NODE_ENV") === "production";
    // Same cross-site reasoning as the login cookie (frontend and API are different sites in production).
    return { httpOnly: true, secure: isProd, sameSite: (isProd ? "none" : "lax") as "none" | "lax", path: "/api/calendar/google" };
  }

  /** Whether the user is connected, and which events they've already added. Creates nothing. */
  @Get("status")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  status(@CurrentUser() user: AuthUser) {
    return this.google.status(user.userId);
  }

  /** Starts the Google consent flow. Connecting never creates an event. */
  @Post("connect")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectDto, @Res({ passthrough: true }) res: Response) {
    const { authUrl, cookie } = await this.google.startConnect(user.userId, dto.returnTo);
    res.cookie(OAUTH_COOKIE, cookie, { ...this.cookieOptions(), maxAge: 10 * 60 * 1000 });
    return { authUrl };
  }

  /** Google redirects the browser here. Always ends with a redirect back to our own pages. */
  @Get("callback")
  @ApiExcludeEndpoint()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") error: string | undefined, @Req() req: Request, @Res() res: Response) {
    let out: Awaited<ReturnType<GoogleCalendarService["handleCallback"]>>;
    try {
      out = await this.google.handleCallback({ code, state, error }, req.cookies?.[OAUTH_COOKIE]);
    } catch {
      out = { result: "error", returnPath: "/news" };
    }
    res.clearCookie(OAUTH_COOKIE, this.cookieOptions());
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, this.google.redirectUrl(out.returnPath, out.result));
  }

  /** The ONLY place an event is created: one explicit click on one event's button. */
  @Post("events/:eventId")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addEvent(@CurrentUser() user: AuthUser, @Param("eventId", new ParseUUIDPipe()) eventId: string) {
    return this.google.addEvent(user.userId, eventId);
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: AuthUser) {
    await this.google.disconnect(user.userId);
  }
}
