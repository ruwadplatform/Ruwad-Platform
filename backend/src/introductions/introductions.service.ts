import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Introduction } from "./introduction.entity";
import { CreateIntroductionDto } from "./dto/create-introduction.dto";
import { IntroductionStatus } from "../common/enums";
import { ActivityService } from "../activity/activity.service";
import { ActivityType } from "../common/enums";
import { UsersService } from "../users/users.service";
import { EmailService } from "../email/email.service";

const NOTIFY_STATUSES: IntroductionStatus[] = [IntroductionStatus.ACCEPTED, IntroductionStatus.DECLINED, IntroductionStatus.COMPLETED];
const STATUS_LABEL: Record<IntroductionStatus, string> = {
  [IntroductionStatus.PENDING]: "Pending",
  [IntroductionStatus.IN_REVIEW]: "In Review",
  [IntroductionStatus.ACCEPTED]: "Accepted",
  [IntroductionStatus.DECLINED]: "Declined",
  [IntroductionStatus.COMPLETED]: "Completed",
};

@Injectable()
export class IntroductionsService {
  private readonly logger = new Logger(IntroductionsService.name);

  constructor(
    @InjectRepository(Introduction) private readonly repo: Repository<Introduction>,
    private readonly activity: ActivityService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  findForUser(userId: string): Promise<Introduction[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: "DESC" } });
  }

  async create(userId: string, dto: CreateIntroductionDto): Promise<Introduction> {
    const now = new Date().toISOString().slice(0, 10);
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        status: IntroductionStatus.PENDING,
        statusHistory: [{ status: IntroductionStatus.PENDING, date: now }],
        ...dto,
      }),
    );
    await this.activity.log(
      userId,
      ActivityType.INTRO_SUBMITTED,
      `Requested an introduction to ${dto.investor ?? dto.startup ?? "a profile"}`,
      "/introductions",
    );
    return saved;
  }

  async findOwnedOrThrow(userId: string, id: string): Promise<Introduction> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException("Introduction request not found");
    return item;
  }

  async findAny(id: string): Promise<Introduction> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Introduction request not found");
    return item;
  }

  findAll(): Promise<Introduction[]> {
    return this.repo.find({ order: { createdAt: "DESC" } });
  }

  async updateStatus(id: string, status: IntroductionStatus): Promise<Introduction> {
    const item = await this.findAny(id);
    item.status = status;
    item.statusHistory = [...(item.statusHistory ?? []), { status, date: new Date().toISOString().slice(0, 10) }];
    const saved = await this.repo.save(item);

    if (NOTIFY_STATUSES.includes(status)) {
      try {
        const [requester, settings] = await Promise.all([
          this.usersService.findByIdOrThrow(saved.userId),
          this.usersService.getOrCreateSettings(saved.userId),
        ]);
        if (settings.emailNotifications && settings.introRequestAlerts) {
          await this.emailService.sendIntroductionStatusChanged({
            to: requester.email,
            targetName: saved.investor ?? saved.startup ?? "the requested profile",
            statusLabel: STATUS_LABEL[status],
            message: saved.message,
          });
        }
      } catch (e) {
        this.logger.error(`Introduction status notification failed for ${saved.id}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    return saved;
  }
}
