import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./user.entity";
import { UserSettings } from "./user-settings.entity";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UserRole, UserStatus } from "../common/enums";
import { UploadsService } from "../uploads/uploads.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

export type PublicUser = Omit<User, "passwordHash">;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserSettings) private readonly settingsRepo: Repository<UserSettings>,
    private readonly uploads: UploadsService,
  ) {}

  toPublic(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  /** Oldest active admin — the actor recorded for decisions made from the
   * admin notification email, where nobody is signed in. */
  findFirstAdmin(): Promise<User | null> {
    return this.users.findOne({ where: [{ role: UserRole.RUWAD_ADMIN, status: UserStatus.ACTIVE }, { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE }], order: { createdAt: "ASC" } });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  create(data: Partial<User>): Promise<User> {
    const user = this.users.create({ ...data, email: data.email!.toLowerCase() });
    return this.users.save(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findByIdOrThrow(id);
    const previousImageId = user.profileImageId ?? null;
    if (dto.profileImageId) await this.uploads.assertOwnAvatar(dto.profileImageId, id);
    Object.assign(user, dto);
    const saved = await this.users.save(user);
    // Drop the superseded/removed photo so replaced uploads don't pile up.
    if (dto.profileImageId !== undefined && previousImageId && previousImageId !== (dto.profileImageId ?? null)) {
      await this.uploads.deleteOwnAvatar(previousImageId, id);
    }
    return saved;
  }

  async getOrCreateSettings(userId: string): Promise<UserSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ userId });
      settings = await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserSettings> {
    const settings = await this.getOrCreateSettings(userId);
    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }
}
