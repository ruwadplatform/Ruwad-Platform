import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WatchlistItem } from "./watchlist-item.entity";
import { WatchlistKind } from "../common/enums";
import { ActivityService } from "../activity/activity.service";
import { ActivityType } from "../common/enums";
import { Startup } from "../startups/startup.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { Multinational } from "../multinationals/multinational.entity";

const KIND_LABEL: Record<WatchlistKind, string> = {
  [WatchlistKind.STARTUP]: "startup",
  [WatchlistKind.INVESTOR]: "investor",
  [WatchlistKind.HUB]: "hub",
  [WatchlistKind.RESEARCH]: "research institution",
  [WatchlistKind.MULTINATIONAL]: "multinational",
  [WatchlistKind.REPORT]: "report",
};

@Injectable()
export class WatchlistsService {
  constructor(
    @InjectRepository(WatchlistItem) private readonly repo: Repository<WatchlistItem>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(ResearchInstitution) private readonly research: Repository<ResearchInstitution>,
    @InjectRepository(Multinational) private readonly multinationals: Repository<Multinational>,
    private readonly activity: ActivityService,
  ) {}

  findForUser(userId: string): Promise<WatchlistItem[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: "DESC" } });
  }

  private repoForKind(kind: WatchlistKind): Repository<any> | null {
    return kind === WatchlistKind.STARTUP ? this.startups
      : kind === WatchlistKind.INVESTOR ? this.investors
      : kind === WatchlistKind.HUB ? this.hubs
      : kind === WatchlistKind.RESEARCH ? this.research
      : kind === WatchlistKind.MULTINATIONAL ? this.multinationals
      : null;
  }

  /** Same rows as findForUser, but with each entityId resolved back to its
   * slug — the frontend's directory pages still key entities by slug (local
   * mock data), so this is what useWatchlist()/useIsSaved() actually read. */
  async findForUserResolved(userId: string): Promise<{ kind: WatchlistKind; entityId: string; slug: string | null }[]> {
    const rows = await this.findForUser(userId);
    return Promise.all(
      rows.map(async (r) => {
        const repo = this.repoForKind(r.kind);
        const entity = repo ? await repo.findOne({ where: { id: r.entityId } as any }) : null;
        return { kind: r.kind, entityId: r.entityId, slug: entity ? (entity as any).slug : null };
      }),
    );
  }

  /** Resolves a slug to its real entity UUID for the four directory kinds
   * the frontend actually stars (startups/investors/hubs/research/
   * multinationals) — REPORT has no slug-lookup path since nothing calls
   * toggle-by-slug for it yet. */
  async resolveEntityId(kind: WatchlistKind, slug: string): Promise<string> {
    const repo = this.repoForKind(kind);
    if (!repo) throw new BadRequestException(`Watchlist kind ${kind} has no slug lookup`);
    const entity = await repo.findOne({ where: { slug } as any });
    if (!entity) throw new NotFoundException(`No ${kind} found with slug "${slug}"`);
    return (entity as any).id;
  }

  async toggle(userId: string, kind: WatchlistKind, entityId: string): Promise<{ saved: boolean }> {
    const existing = await this.repo.findOne({ where: { userId, kind, entityId } });
    if (existing) {
      await this.repo.delete(existing.id);
      return { saved: false };
    }
    await this.repo.save(this.repo.create({ userId, kind, entityId }));
    await this.activity.log(userId, ActivityType.WATCHLIST_ADD, `Added a ${KIND_LABEL[kind]} to your watchlist`, "/watchlist");
    return { saved: true };
  }

  isSaved(userId: string, kind: WatchlistKind, entityId: string): Promise<boolean> {
    return this.repo.exists({ where: { userId, kind, entityId } });
  }
}
