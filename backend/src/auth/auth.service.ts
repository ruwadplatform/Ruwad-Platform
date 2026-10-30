import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, MoreThan, Repository } from "typeorm";
import { createHash, randomBytes } from "crypto";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UserRole, UserStatus } from "../common/enums";
import { User } from "../users/user.entity";
import { PasswordResetToken } from "./password-reset-token.entity";
import { ResetPasswordDto } from "./dto/password-reset.dto";
import { EmailService } from "../email/email.service";
import { isStrongPassword } from "./password-policy";
import { EmailVerificationService } from "./email-verification.service";

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// A second request for the same account inside this window is answered
// generically but sends nothing: a per-account brake on top of the per-IP
// throttle, so one address cannot be used to spam an inbox.
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const hashResetToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** The password was right but the email address has not been verified yet (only while EMAIL_VERIFICATION_REQUIRED is on). The controller turns this into a 403 with a code. */
export class EmailNotVerifiedError extends Error {
  constructor(public readonly user: User) {
    super("Email not verified");
  }
}

const isUniqueViolation = (e: unknown) => (e as { code?: string; driverError?: { code?: string } })?.code === "23505" || (e as { driverError?: { code?: string } })?.driverError?.code === "23505";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    @InjectRepository(PasswordResetToken) private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly verification: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException("An account with this email already exists");

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.users.create(this.userData(dto, passwordHash));
    await this.users.getOrCreateSettings(user.id);
    return user;
  }

  /** What a sign-up form becomes in the users table (shared by both sign-up paths). */
  private userData(dto: RegisterDto, passwordHash: string): Partial<User> {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      role: dto.role ?? UserRole.USER,
      jobTitle: dto.jobTitle,
      organization: dto.organization,
      organizationWebsite: dto.organizationWebsite,
      organizationStage: dto.organizationStage,
      organizationCategory: dto.organizationCategory,
      organizationCity: dto.organizationCity,
      organizationType: dto.organizationType,
      country: dto.country,
      city: dto.city,
      phone: dto.phone,
      interests: dto.interests ?? [],
    };
  }

  /** Sign-up while EMAIL_VERIFICATION_REQUIRED is on. It signs nobody in and answers the same way whatever the address is:
   *   - a new address: the account is created UNVERIFIED and a code is emailed;
   *   - an address whose account is still unverified: that account is OVERWRITTEN with these details (so someone who registered another person's address earlier
   *     cannot keep a password they know) and a fresh code is emailed;
   *   - an address that already has a verified account: nothing changes and a "you already have an account" email is sent instead.
   * Returns the account the code belongs to, or null for the third case (the caller then puts a made-up id in the pending cookie so it looks the same). */
  async registerWithVerification(dto: RegisterDto, ip: string | undefined): Promise<{ userId: string | null }> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS); // the same cost on every path
    const data = this.userData({ ...dto, email }, passwordHash);
    let existing = await this.users.findByEmail(email);
    if (!existing) {
      try {
        const created = await this.users.create(data);
        await this.users.getOrCreateSettings(created.id);
        await this.verification.issueCode(created, ip);
        return { userId: created.id };
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        existing = await this.users.findByEmail(email); // lost a race with a simultaneous sign-up for the same address
        if (!existing) throw e;
      }
    }
    if (!existing.emailVerifiedAt && existing.status === UserStatus.ACTIVE) {
      const { email: _same, ...rest } = data;
      const updated = await this.users.overwriteUnverified(existing.id, rest);
      if (updated) {
        await this.verification.issueCode(updated, ip);
        return { userId: updated.id };
      }
    }
    await this.verification.sendExistingAccountNotice(existing);
    return { userId: null };
  }

  async validateCredentials(dto: LoginDto): Promise<User> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException("Invalid email or password");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password");
    // Only after the password is right, so this reveals nothing to someone who does not know it.
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException("This account is not active. Please contact RUWĀD support.");
    // Only after the password is right, so a stranger learns nothing about an address from this. With verification off the account is simply signed in, as before.
    if (this.verification.required && !user.emailVerifiedAt) throw new EmailNotVerifiedError(user);
    return user;
  }

  signToken(user: User): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }

  /** Always resolves without revealing whether the account exists. Any
   * failure (lookup, DB, email provider) is logged and swallowed so the
   * caller's response is identical in every case. */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    try {
      const user = await this.users.findByEmail(rawEmail.trim());
      if (!user) return;

      const recent = await this.resetTokens.findOne({ where: { userId: user.id, createdAt: MoreThan(new Date(Date.now() - RESET_RESEND_COOLDOWN_MS)) } });
      if (recent) return;

      const rawToken = randomBytes(32).toString("base64url");
      await this.dataSource.transaction(async (m) => {
        const repo = m.getRepository(PasswordResetToken);
        // Supersede every earlier outstanding link: only the newest works.
        await repo.update({ userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
        await repo.save(repo.create({ userId: user.id, tokenHash: hashResetToken(rawToken), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) }));
      });
      await this.email.sendPasswordReset({ to: user.email, firstName: user.firstName, token: rawToken });
    } catch (e) {
      this.logger.error(`Password reset request failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const invalid = () => new BadRequestException("This password reset link is invalid. Please request a new one.");
    if (dto.password !== dto.confirmPassword) throw new BadRequestException("Passwords do not match.");

    // Unknown, already-used and superseded links are all "invalid"; only a
    // link that was genuine and simply ran out of time reads as "expired".
    const record = await this.resetTokens.findOne({ where: { tokenHash: hashResetToken(dto.token) } });
    if (!record || record.usedAt) throw invalid();
    if (record.expiresAt.getTime() <= Date.now()) throw new BadRequestException("This password reset link has expired. Please request a new one.");

    if (!isStrongPassword(dto.password)) throw new BadRequestException("Your password does not meet the required security requirements.");

    // Same bcrypt comparison login uses: the candidate is hashed against the
    // stored hash's own salt, so plain text is never compared or stored. A
    // rejection here happens before the token is claimed, so the user can
    // retry with the same link.
    const user = await this.users.findByIdOrThrow(record.userId);
    if (await bcrypt.compare(dto.password, user.passwordHash)) {
      throw new BadRequestException("Please choose a password different from your existing password.");
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    await this.dataSource.transaction(async (m) => {
      // Claim the token first: the conditional update succeeds only once, so
      // two simultaneous submissions cannot both reset the password.
      const claimed = await m.getRepository(PasswordResetToken).update({ id: record.id, usedAt: IsNull() }, { usedAt: new Date() });
      if (!claimed.affected) throw invalid();
      await m.getRepository(User).update({ id: record.userId }, { passwordHash });
      await m.getRepository(PasswordResetToken).update({ userId: record.userId, usedAt: IsNull() }, { usedAt: new Date() });
    });
  }
}
