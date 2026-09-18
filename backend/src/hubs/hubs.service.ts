import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Hub } from "./hub.entity";
import { HubProgram } from "./hub-program.entity";
import { HubPortfolioItem } from "./hub-portfolio-item.entity";
import { CreateHubDto } from "./dto/create-hub.dto";
import { UpdateHubDto } from "./dto/update-hub.dto";
import { QueryHubsDto } from "./dto/query-hubs.dto";
import { DirectorySharedService } from "../directory-shared/directory-shared.service";
import { Startup } from "../startups/startup.entity";
import { EntityKind } from "../common/enums";
import { initials, slugify } from "../common/slug.util";
import { paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class HubsService {
  constructor(
    @InjectRepository(Hub) private readonly repo: Repository<Hub>,
    @InjectRepository(HubProgram) private readonly programs: Repository<HubProgram>,
    @InjectRepository(HubPortfolioItem) private readonly portfolio: Repository<HubPortfolioItem>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    private readonly shared: DirectorySharedService,
  ) {}

  private async uniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.repo.findOne({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${n++}`;
    }
  }

  async create(dto: CreateHubDto): Promise<Hub> {
    const slug = await this.uniqueSlug(dto.name);
    const saved = await this.repo.save(this.repo.create({
      slug, name: dto.name, type: dto.type, city: dto.city, country: dto.country, founded: dto.founded, website: dto.website,
      operatingRegion: dto.operatingRegion, ownershipType: dto.ownershipType, status: dto.status ?? "Open", deadline: dto.deadline,
      desc: dto.desc, about: dto.about, stagesSupported: dto.stagesSupported ?? [], geographicCoverage: dto.geographicCoverage ?? [],
      support: dto.support ?? [], fundingAvailable: dto.fundingAvailable, fundingType: dto.fundingType,
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported"],
    }));
    await this.applyRelations(saved.id, dto);
    return saved;
  }

  async update(id: string, dto: UpdateHubDto): Promise<Hub> {
    const hub = await this.findEntityOrThrow(id);
    if (dto.name && dto.name !== hub.name) hub.slug = await this.uniqueSlug(dto.name, id);
    Object.assign(hub, dto);
    const saved = await this.repo.save(hub);
    await this.applyRelations(id, dto);
    return saved;
  }

  private async applyRelations(hubId: string, dto: Partial<CreateHubDto>): Promise<void> {
    if (dto.sectors) await this.shared.setSectors(EntityKind.HUB, hubId, dto.sectors);
    if (dto.programs) {
      await this.programs.delete({ hubId });
      if (dto.programs.length) await this.programs.save(this.programs.create(dto.programs.map((p) => ({ hubId, ...p }))));
    }
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<Hub> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Hub not found");
    });
  }

  async findAll(query: QueryHubsDto): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("h");
    if (query.search) qb.andWhere("h.name ILIKE :q", { q: `%${query.search}%` });
    if (query.type) qb.andWhere("h.type = :type", { type: query.type });
    if (query.city) qb.andWhere("h.city = :city", { city: query.city });
    if (query.status) qb.andWhere("h.status = :status", { status: query.status });
    qb.orderBy("h.name", (query.order ?? "asc").toUpperCase() as "ASC" | "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map(async (h) => {
      const [healthcareFocus, programs, portfolioCount] = await Promise.all([
        this.shared.getSectorNames(EntityKind.HUB, h.id),
        this.programs.find({ where: { hubId: h.id } }),
        this.portfolio.count({ where: { hubId: h.id } }),
      ]);
      return {
        id: h.id, slug: h.slug, name: h.name, logo: initials(h.name), logoImageId: h.logoImageId ?? null, type: h.type, city: h.city, country: h.country,
        status: h.status, website: h.website, provenanceLastUpdated: h.provenanceLastUpdated,
        stagesSupported: h.stagesSupported, healthcareFocus, programs, portfolioCount,
        eligibility: h.eligibility,
      };
    }));
    return paginate(items, total, page, limit);
  }

  async findBySlugOrThrow(slug: string): Promise<Record<string, unknown>> {
    const hub = await this.repo.findOne({ where: { slug } });
    if (!hub) throw new NotFoundException("Hub not found");
    // No `documents` in the public payload — see DataRoomService.status().
    const [sectors, programs, portfolioItems, partnerships, contact] = await Promise.all([
      this.shared.getSectorNames(EntityKind.HUB, hub.id),
      this.programs.find({ where: { hubId: hub.id } }),
      this.portfolio.find({ where: { hubId: hub.id } }),
      this.shared.getPartnerships(EntityKind.HUB, hub.id),
      this.shared.getContact(EntityKind.HUB, hub.id),
    ]);
    const portfolioResolved = await Promise.all(portfolioItems.map(async (p) => {
      const startup = p.startupId ? await this.startups.findOne({ where: { id: p.startupId } }) : null;
      return {
        name: p.companyName, sector: p.sector, stage: p.stage, location: p.location, program: p.programName, year: p.year,
        ...(startup ? { startupId: startup.id, startupSlug: startup.slug, startupLogo: initials(startup.name), startupScore: startup.score, startupCategory: startup.category, startupTagline: startup.tagline } : {}),
      };
    }));
    return { ...hub, logo: initials(hub.name), sectors, programs, portfolio: portfolioResolved, partnerships, contact };
  }
}
