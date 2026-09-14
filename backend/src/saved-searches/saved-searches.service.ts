import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SavedSearch } from "./saved-search.entity";
import { CreateSavedSearchDto } from "./dto/create-saved-search.dto";
import { UpdateSavedSearchDto } from "./dto/update-saved-search.dto";
import { ActivityService } from "../activity/activity.service";
import { ActivityType } from "../common/enums";

@Injectable()
export class SavedSearchesService {
  constructor(
    @InjectRepository(SavedSearch) private readonly repo: Repository<SavedSearch>,
    private readonly activity: ActivityService,
  ) {}

  findForUser(userId: string): Promise<SavedSearch[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: "DESC" } });
  }

  async create(userId: string, dto: CreateSavedSearchDto): Promise<SavedSearch> {
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        entityType: dto.entityType,
        label: dto.label,
        search: dto.search ?? "",
        filters: dto.filters ?? {},
        resultCountAtSave: dto.resultCount ?? 0,
        alertEnabled: false,
      }),
    );
    await this.activity.log(userId, ActivityType.SEARCH_SAVED, `Saved search "${dto.label}"`, "/saved-searches");
    return saved;
  }

  private async findOwnedOrThrow(userId: string, id: string): Promise<SavedSearch> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException("Saved search not found");
    return item;
  }

  async update(userId: string, id: string, dto: UpdateSavedSearchDto): Promise<SavedSearch> {
    const item = await this.findOwnedOrThrow(userId, id);
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async markRun(userId: string, id: string): Promise<SavedSearch> {
    const item = await this.findOwnedOrThrow(userId, id);
    item.lastRunAt = new Date();
    return this.repo.save(item);
  }

  async remove(userId: string, id: string): Promise<void> {
    const item = await this.findOwnedOrThrow(userId, id);
    await this.repo.delete(item.id);
  }
}
