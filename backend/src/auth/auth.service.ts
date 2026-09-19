import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, MoreThan, Repository } from "typeorm";
import { createHash, randomBytes } from "crypto";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UserRole } from "../common/enums";
import { User } from "../users/user.entity";
import { PasswordResetToken } from "./password-reset-token.entity";
import { ResetPasswordDto } from "./dto/password-reset.dto";
import { EmailService } from "../email/email.service";
import { isStrongPassword } from "./password-policy";

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// A second request for the same account inside this window is answered
// generically but sends nothing: a per-account brake on top of the per-IP
// throttle, so one address cannot be used to spam an inbox.
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const hashResetToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    @InjectRepository(PasswordResetToken) private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException("An account with this email already exists");

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.users.create({
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
      interests: dto.interests ?? [],
    });
    await this.users.getOrCreateSettings(user.id);
    return user;
  }

  async validateCredentials(dto: LoginDto): Promise<User> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException("Invalid email or password");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password");
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
