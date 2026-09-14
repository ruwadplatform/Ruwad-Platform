import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Introduction } from "./introduction.entity";
import { CreateIntroductionDto } from "./dto/create-introduction.dto";
import { IntroductionStatus } from "../common/enums";
import { ActivityService } from "../activity/activity.service";
import { ActivityType } from "../common/enums";

@Injectable()
export class IntroductionsService {
  constructor(
    @InjectRepository(Introduction) private readonly repo: Repository<Introduction>,
    private readonly activity: ActivityService,
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
    return this.repo.save(item);
  }
}
