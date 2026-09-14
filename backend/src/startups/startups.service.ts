import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Startup } from "./startup.entity";
import { FundingRound } from "./funding-round.entity";
import { CreateStartupDto } from "./dto/create-startup.dto";
import { UpdateStartupDto } from "./dto/update-startup.dto";
import { QueryStartupsDto } from "./dto/query-startups.dto";
import { DirectorySharedService } from "../directory-shared/directory-shared.service";
import { InvestmentsService } from "../investments/investments.service";
import { Investor } from "../investors/investor.entity";
import { EntityKind } from "../common/enums";
import { compositeScore, initials, slugify } from "../common/slug.util";
import { paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class StartupsService {
  constructor(
    @InjectRepository(Startup) private readonly repo: Repository<Startup>,
    @InjectRepository(FundingRound) private readonly rounds: Repository<FundingRound>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    private readonly shared: DirectorySharedService,
    private readonly investments: InvestmentsService,
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

  async create(dto: CreateStartupDto): Promise<Startup> {
    const slug = await this.uniqueSlug(dto.name);
    const score = compositeScore([70, 70, 70, 70, 70, 70]); // placeholder subscores until an admin sets real ones
    const startup = this.repo.create({
      slug,
      name: dto.name, category: dto.category, subsector: dto.subsector, tagline: dto.tagline,
      country: dto.country, city: dto.city, hq: dto.hq, founded: dto.founded, stage: dto.stage,
      status: dto.status ?? "Active", businessModel: dto.businessModel, employees: dto.employees,
      fundingTotal: dto.fundingTotal, valuation: dto.valuation, fundraising: dto.fundraising ?? false,
      targetRaise: dto.targetRaise, desc: dto.desc, problem: dto.problem, solution: dto.solution, advantage: dto.advantage,
      sfda: dto.sfda, fda: dto.fda, ce: dto.ce, clinicalStatus: dto.clinicalStatus, patentStatus: dto.patentStatus,
      marketTam: dto.marketTam, marketSam: dto.marketSam, marketSom: dto.marketSom, marketCompetitors: dto.marketCompetitors ?? [],
      legalName: dto.legalName, formerName: dto.formerName ?? "—", website: dto.website, email: dto.email, phone: dto.phone, linkedin: dto.linkedin,
      registrationNumber: `CR-${Math.floor(100000 + Math.random() * 899999)}`,
      verified: "unclaimed",
      scoreGrowth: 70, scoreFinancial: 70, scoreMarket: 70, scoreTeam: 70, scoreRegulatory: 70, scoreTech: 70, score,
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported"],
    });
    const saved = await this.repo.save(startup);
    await this.applyRelations(saved.id, dto);
    return saved;
  }

  async update(id: string, dto: UpdateStartupDto): Promise<Startup> {
    const startup = await this.findEntityOrThrow(id);
    if (dto.name && dto.name !== startup.name) startup.slug = await this.uniqueSlug(dto.name, id);
    Object.assign(startup, {
      ...dto,
      marketCompetitors: dto.marketCompetitors ?? startup.marketCompetitors,
      formerName: dto.formerName ?? startup.formerName,
    });
    const saved = await this.repo.save(startup);
    await this.applyRelations(id, dto);
    return saved;
  }

  private async applyRelations(startupId: string, dto: Partial<CreateStartupDto>): Promise<void> {
    if (dto.sectors) await this.shared.setSectors(EntityKind.STARTUP, startupId, dto.sectors);
    if (dto.team) await this.shared.setTeamMembers(EntityKind.STARTUP, startupId, dto.team);
    if (dto.documents) await this.shared.setDocuments(EntityKind.STARTUP, startupId, dto.documents);
    if (dto.products) await this.shared.setProducts(EntityKind.STARTUP, startupId, dto.products);
    if (dto.rounds) {
      await this.rounds.delete({ startupId });
      if (dto.rounds.length) await this.rounds.save(this.rounds.create(dto.rounds.map((r) => ({ startupId, ...r }))));
    }
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<Startup> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Startup not found");
    });
  }

  async findAll(query: QueryStartupsDto): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("s");
    if (query.search) qb.andWhere("s.name ILIKE :q", { q: `%${query.search}%` });
    if (query.sector) qb.andWhere("s.category = :sector", { sector: query.sector });
    if (query.stage) qb.andWhere("s.stage = :stage", { stage: query.stage });
    if (query.country) qb.andWhere("s.country = :country", { country: query.country });
    if (query.city) qb.andWhere("s.city = :city", { city: query.city });

    const sortColumn = ["name", "founded", "fundingTotal", "score"].includes(query.sort ?? "") ? query.sort! : "score";
    qb.orderBy(`s.${sortColumn}`, (query.order ?? "desc").toUpperCase() as "ASC" | "DESC");
    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map((s) => this.toSummary(s));
    return paginate(items, total, page, limit);
  }

  async findBySlugOrThrow(slug: string): Promise<Record<string, unknown>> {
    const startup = await this.repo.findOne({ where: { slug } });
    if (!startup) throw new NotFoundException("Startup not found");
    return this.toDetail(startup);
  }

  toSummary(s: Startup) {
    return {
      id: s.id, slug: s.slug, name: s.name, logo: initials(s.name), logoImageId: s.logoImageId ?? null, category: s.category, city: s.city,
      country: s.country, stage: s.stage, status: s.status, founded: s.founded, employees: s.employees,
      fundingTotal: Number(s.fundingTotal), score: s.score, tagline: s.tagline,
      sfda: s.sfda, provenanceLastUpdated: s.provenanceLastUpdated,
    };
  }

  async toDetail(s: Startup) {
    const [sectors, team, rounds, documents, products, contact, investorLinks] = await Promise.all([
      this.shared.getSectorNames(EntityKind.STARTUP, s.id),
      this.shared.getTeamMembers(EntityKind.STARTUP, s.id),
      this.rounds.find({ where: { startupId: s.id }, order: { date: "ASC" } }),
      this.shared.getDocuments(EntityKind.STARTUP, s.id),
      this.shared.getProducts(EntityKind.STARTUP, s.id),
      this.shared.getContact(EntityKind.STARTUP, s.id),
      this.investments.findForTarget(EntityKind.STARTUP, s.id),
    ]);
    const investorRows = investorLinks.length
      ? await this.investors.find({ where: { id: In(investorLinks.map((i) => i.investorId)) } })
      : [];
    return {
      ...s,
      fundingTotal: Number(s.fundingTotal), valuation: Number(s.valuation),
      logo: initials(s.name), sectors, team, rounds, documents, products, contact,
      investorIds: investorRows.map((v) => v.slug),
      sub: { growth: s.scoreGrowth, financial: s.scoreFinancial, market: s.scoreMarket, team: s.scoreTeam, regulatory: s.scoreRegulatory, tech: s.scoreTech },
    };
  }
}
