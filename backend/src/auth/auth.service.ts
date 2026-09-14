import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UserRole } from "../common/enums";
import { User } from "../users/user.entity";

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
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
      country: dto.country,
      city: dto.city,
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
}
