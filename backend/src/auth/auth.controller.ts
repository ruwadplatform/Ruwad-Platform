import { randomUUID } from "crypto";
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpException, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService, EmailNotVerifiedError } from "./auth.service";
import { EmailVerificationService } from "./email-verification.service";
import { RESEND_COOLDOWN_MS, PENDING_TTL_MS, maskEmail } from "./otp-logic";
import { ResendVerificationDto, VerifyEmailDto } from "./dto/verify-email.dto";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { UsersService } from "../users/users.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { resolveClientIp } from "../common/rate-limit-keys";

const COOKIE_NAME = "ruwad_token";
/** A note that THIS browser just signed up or proved a password; readable only by the verification endpoints, never a login (see otp-logic.ts). */
const PENDING_COOKIE = "ruwad_pending";
const PENDING_PATH = "/api/auth";
const INVALID_CODE = { statusCode: 400, error: "Bad Request", code: "INVALID_OTP", message: "That code isn't valid or has expired. Request a new one." };
const RESEND_MESSAGE = "If this address is waiting for verification, a new code has been sent. It can take a minute to arrive.";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly verification: EmailVerificationService,
  ) {}

  private authCookieOptions(): { httpOnly: true; secure: boolean; sameSite: "none" | "lax"; path: string } {
    const isProd = this.config.get("NODE_ENV") === "production";
    return {
      httpOnly: true,
      secure: isProd,
      // Frontend and backend are two separate Render services (different
      // onrender.com subdomains — onrender.com is a public-suffix domain,
      // so these count as different sites for cookie purposes even though
      // they share a parent domain), so the cookie must be sendable
      // cross-site; "lax" is used in dev since localhost-to-localhost
      // doesn't need it.
      sameSite: isProd ? "none" : "lax",
      path: "/",
    };
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie(COOKIE_NAME, token, { ...this.authCookieOptions(), maxAge: COOKIE_MAX_AGE_MS });
  }

  private setPendingCookie(res: Response, userId: string, typedEmail: string) {
    res.cookie(PENDING_COOKIE, this.verification.pendingCookieValue(userId, typedEmail), { ...this.authCookieOptions(), path: PENDING_PATH, maxAge: PENDING_TTL_MS });
  }

  private clearPendingCookie(res: Response) {
    res.clearCookie(PENDING_COOKIE, { ...this.authCookieOptions(), path: PENDING_PATH });
  }

  @Post("register")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (this.verification.required) {
      // No login cookie: the account is created unverified (or an existing one is left alone) and the answer is the same either way. The pending cookie only lets this
      // browser go on to verify; for an address that already had an account it holds a made-up id, so it cannot be told apart.
      const out = await this.auth.registerWithVerification(dto, resolveClientIp(req));
      this.setPendingCookie(res, out.userId ?? randomUUID(), dto.email);
      return { status: "verification_required", message: "If this address can be used for a new account, we have sent a 6-digit code to it.", resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
    }
    const user = await this.auth.register(dto);
    const token = this.auth.signToken(user);
    this.setAuthCookie(res, token);
    return this.users.toPublic(user);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    let user;
    try {
      user = await this.auth.validateCredentials(dto);
    } catch (e) {
      if (!(e instanceof EmailNotVerifiedError)) throw e;
      // The password was right, so saying "verify your email" reveals nothing a stranger could use. Send a fresh code if the limits allow and hand this browser the pending cookie.
      this.setPendingCookie(res, e.user.id, e.user.email);
      await this.verification.issueCode(e.user, resolveClientIp(req));
      throw new ForbiddenException({ statusCode: 403, error: "Forbidden", code: "EMAIL_NOT_VERIFIED", message: "Please verify your email address to continue.", maskedEmail: maskEmail(e.user.email) });
    }
    const token = this.auth.signToken(user);
    this.setAuthCookie(res, token);
    return this.users.toPublic(user);
  }

  @Post("forgot-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    // Deliberately not awaited: the lookup, token write and email send take
    // noticeably longer for a real account, and awaiting them would let a
    // caller tell whether an address is registered from response time alone.
    // requestPasswordReset() catches and logs every failure itself.
    void this.auth.requestPasswordReset(dto.email);
    return { message: "If an account exists for this email, a password reset link has been sent." };
  }

  @Post("reset-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { message: "Your password has been reset successfully. You can now sign in with your new password." };
  }

  /** Which address this browser is verifying, from the pending cookie alone (no database lookup, so it reveals nothing about any account). */
  @Get("pending-verification")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  pendingVerification(@Req() req: Request) {
    const ticket = this.verification.required ? this.verification.readPendingCookie(req.cookies?.[PENDING_COOKIE]) : null;
    return { pending: !!ticket, maskedEmail: ticket?.m ?? null };
  }

  /** Checks the 6-digit code. Every failure (wrong, expired, reused, superseded, unknown account) answers identically. On success the address is verified, and ONLY if this
   * browser holds the pending cookie for that account is the user also signed in; from any other browser they are told to sign in. */
  @Post("verify-email")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verification.assertEnabled();
    const ticket = this.verification.readPendingCookie(req.cookies?.[PENDING_COOKIE]);
    let user = ticket ? await this.users.findById(ticket.u) : null;
    if (!user && dto.email) user = await this.users.findByEmail(dto.email.trim());
    const ok = await this.verification.verify(user, dto.code);
    if (!ok || !user) throw new BadRequestException(INVALID_CODE);
    this.clearPendingCookie(res);
    if (ticket && ticket.u === user.id) {
      const fresh = await this.users.findByIdOrThrow(user.id);
      this.setAuthCookie(res, this.auth.signToken(fresh));
      return { verified: true, signedIn: true, user: this.users.toPublic(fresh) };
    }
    return { verified: true, signedIn: false };
  }

  /** Sends a new code (the previous one stops working). The answer is the same for every address; only the browser that holds the pending cookie is told when a limit was hit. */
  @Post("resend-verification")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    this.verification.assertEnabled();
    const ticket = this.verification.readPendingCookie(req.cookies?.[PENDING_COOKIE]);
    let user = ticket ? await this.users.findById(ticket.u) : null;
    const viaTicket = !!user;
    if (!user && dto.email) user = await this.users.findByEmail(dto.email.trim());
    if (user && !user.emailVerifiedAt && user.status === "ACTIVE") {
      const r = await this.verification.issueCode(user, resolveClientIp(req));
      if (viaTicket && !r.sent && r.reason && r.reason !== "DELIVERY_FAILED") {
        throw new HttpException({ statusCode: 429, error: "Too Many Requests", code: r.reason === "COOLDOWN" ? "RESEND_COOLDOWN" : "RESEND_LIMIT", message: r.reason === "COOLDOWN" ? "Please wait a moment before asking for another code." : "Too many codes have been requested. Try again later, or contact RUWĀD support.", retryAfterSeconds: r.retryAfterSeconds ?? null }, 429);
      }
    } else {
      await this.verification.dummyWork();
    }
    return { message: RESEND_MESSAGE, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
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
    // Same attributes as setAuthCookie — an expiring Set-Cookie with
    // mismatched secure/sameSite risks the browser treating it as a
    // different cookie instead of overwriting the real session cookie.
    res.clearCookie(COOKIE_NAME, this.authCookieOptions());
    return { success: true };
  }
}
