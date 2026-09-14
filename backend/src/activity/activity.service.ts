import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ActivityLog } from "./activity-log.entity";
import { ActivityType } from "../common/enums";

/** Logs important, user-meaningful events only (watchlist add, search
 * saved, intro submitted, profile updated, listing edited) — not every
 * click, matching the frontend's original activity-feed intent. */
@Injectable()
export class ActivityService {
  constructor(@InjectRepository(ActivityLog) private readonly repo: Repository<ActivityLog>) {}

  async log(userId: string, type: ActivityType, text: string, route?: string): Promise<void> {
    await this.repo.save(this.repo.create({ userId, type, text, route }));
  }

  findForUser(userId: string, limit = 30): Promise<ActivityLog[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: "DESC" }, take: limit });
  }
}
