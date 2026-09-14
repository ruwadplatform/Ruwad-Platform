import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Investor } from "./investor.entity";
import { CreateInvestorDto } from "./dto/create-investor.dto";
import { UpdateInvestorDto } from "./dto/update-investor.dto";
import { QueryInvestorsDto } from "./dto/query-investors.dto";
import { DirectorySharedService } from "../directory-shared/directory-shared.service";
import { InvestmentsService } from "../investments/investments.service";
import { StartupsService } from "../startups/startups.service";
import { EntityKind } from "../common/enums";
import { initials, slugify } from "../common/slug.util";
import { paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class InvestorsService {
  constructor(
    @InjectRepository(Investor) private readonly repo: Repository<Investor>,
    private readonly shared: DirectorySharedService,
    private readonly investments: InvestmentsService,
    private readonly startups: StartupsService,
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

  async create(dto: CreateInvestorDto): Promise<Investor> {
    const slug = await this.uniqueSlug(dto.name);
    const saved = await this.repo.save(this.repo.create({
      slug, name: dto.name, short: dto.short, type: dto.type, city: dto.city, founded: dto.founded,
      desc: dto.desc, thesis: dto.thesis, stageFocus: dto.stageFocus ?? [], ticket: dto.ticket, aum: dto.aum, available: dto.available,
      investments: 0, exits: 0, hcDeals: 0,
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported"],
    }));
    await this.applyRelations(saved.id, dto);
    return saved;
  }

  async update(id: string, dto: UpdateInvestorDto): Promise<Investor> {
    const investor = await this.findEntityOrThrow(id);
    if (dto.name && dto.name !== investor.name) investor.slug = await this.uniqueSlug(dto.name, id);
    Object.assign(investor, { ...dto, stageFocus: dto.stageFocus ?? investor.stageFocus });
    const saved = await this.repo.save(investor);
    await this.applyRelations(id, dto);
    return saved;
  }

  private async applyRelations(investorId: string, dto: Partial<CreateInvestorDto>): Promise<void> {
    if (dto.sectors) await this.shared.setSectors(EntityKind.INVESTOR, investorId, dto.sectors);
    if (dto.team) await this.shared.setTeamMembers(EntityKind.INVESTOR, investorId, dto.team);
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<Investor> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Investor not found");
    });
  }

  toSummary(v: Investor) {
    return { id: v.id, slug: v.slug, name: v.name, logo: initials(v.name), logoImageId: v.logoImageId ?? null, type: v.type, city: v.city, ticket: v.ticket, hcDeals: v.hcDeals, desc: v.desc };
  }

  async findAll(query: QueryInvestorsDto): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("v");
    if (query.search) qb.andWhere("v.name ILIKE :q", { q: `%${query.search}%` });
    if (query.type) qb.andWhere("v.type = :type", { type: query.type });
    if (query.city) qb.andWhere("v.city = :city", { city: query.city });
    qb.orderBy(`v.${["name", "founded", "hcDeals"].includes(query.sort ?? "") ? query.sort : "hcDeals"}`, (query.order ?? "desc").toUpperCase() as "ASC" | "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map(async (v) => {
      const [hcFocus, portfolio] = await Promise.all([
        this.shared.getSectorNames(EntityKind.INVESTOR, v.id),
        this.investments.findForInvestor(v.id),
      ]);
      return {
        id: v.id, slug: v.slug, name: v.name, logo: initials(v.name), logoImageId: v.logoImageId ?? null, type: v.type, city: v.city, founded: v.founded,
        desc: v.desc, ticket: v.ticket, hcDeals: v.hcDeals, thesis: v.thesis, stageFocus: v.stageFocus, hcFocus,
        portfolioSize: portfolio.length,
      };
    }));
    return paginate(items, total, page, limit);
  }

  async findBySlugOrThrow(slug: string): Promise<Record<string, unknown>> {
    const investor = await this.repo.findOne({ where: { slug } });
    if (!investor) throw new NotFoundException("Investor not found");
    const [sectors, team, portfolio] = await Promise.all([
      this.shared.getSectorNames(EntityKind.INVESTOR, investor.id),
      this.shared.getTeamMembers(EntityKind.INVESTOR, investor.id),
      this.investments.findForInvestor(investor.id),
    ]);
    const startupPortfolio = await Promise.all(
      portfolio.filter((p) => p.targetEntityType === EntityKind.STARTUP).map(async (p) => {
        const s = await this.startups.findEntityOrThrow(p.targetEntityId).catch(() => null);
        return s ? { ...this.startups.toSummary(s), round: p.round, year: p.year } : null;
      }),
    );
    return { ...investor, logo: initials(investor.name), sectors, team, portfolio: startupPortfolio.filter(Boolean) };
  }
}
