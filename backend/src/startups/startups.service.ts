import { Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { EntityKind, ScoreTrigger } from "../common/enums";
import { initials, slugify } from "../common/slug.util";
import { paginate, PaginatedResult } from "../common/pagination.dto";
import { OrganizationsService } from "../organizations/organizations.service";
import { ScoringService } from "../scoring/scoring.service";
import { affectsScoring } from "./scoring-relevance";

@Injectable()
export class StartupsService {
  private readonly logger = new Logger(StartupsService.name);

  constructor(
    @InjectRepository(Startup) private readonly repo: Repository<Startup>,
    @InjectRepository(FundingRound) private readonly rounds: Repository<FundingRound>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    private readonly shared: DirectorySharedService,
    private readonly investments: InvestmentsService,
    private readonly organizations: OrganizationsService,
    private readonly scoring: ScoringService,
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
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported"],
    });
    const saved = await this.repo.save(startup);
    await this.applyRelations(saved.id, dto);
    // Never calculated here directly — ScoringService is the single source
    // of truth for the score itself; this just tells it something changed.
    await this.scoring.recalculateStartupScore(saved.id, ScoreTrigger.STARTUP_CREATED).catch((e) => {
      this.logger.warn(`Initial scoring failed for startup ${saved.id}: ${e instanceof Error ? e.message : "unknown error"}`);
    });
    return saved;
  }

  async update(id: string, dto: UpdateStartupDto): Promise<Startup> {
    const startup = await this.findEntityOrThrow(id);
    const reassess = affectsScoring(startup, dto);
    if (dto.name && dto.name !== startup.name) startup.slug = await this.uniqueSlug(dto.name, id);
    Object.assign(startup, {
      ...dto,
      marketCompetitors: dto.marketCompetitors ?? startup.marketCompetitors,
      formerName: dto.formerName ?? startup.formerName,
    });
    const saved = await this.repo.save(startup);
    await this.applyRelations(id, dto);
    // Only a change that can move the score or the ML inputs starts a new assessment; a logo, link or wording edit does not.
    if (reassess) {
      await this.scoring.recalculateStartupScore(id, ScoreTrigger.STARTUP_UPDATED).catch((e) => {
        this.logger.warn(`Rescoring failed for startup ${id}: ${e instanceof Error ? e.message : "unknown error"}`);
      });
    }
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

    const sortColumn = ["name", "founded", "fundingTotal", "ruwadScore"].includes(query.sort ?? "") ? query.sort! : "ruwadScore";
    // A null score means "not yet calculated", not "worst" — it must never
    // sort to the top of a descending "best score first" listing.
    qb.orderBy(`s.${sortColumn}`, (query.order ?? "desc").toUpperCase() as "ASC" | "DESC", "NULLS LAST");
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
      fundingTotal: Number(s.fundingTotal), tagline: s.tagline,
      ruwadScore: s.ruwadScore != null ? Number(s.ruwadScore) : null, scoreStatus: s.scoreStatus,
      sfda: s.sfda, provenanceLastUpdated: s.provenanceLastUpdated,
    };
  }

  async toDetail(s: Startup) {
    // Deliberately no `documents` here: this is the PUBLIC profile payload, and
    // Data Room document metadata (names, on-file flags…) is only ever served by
    // DataRoomService.status() after an owner/admin/APPROVED check.
    const [sectors, team, rounds, products, contact, investorLinks, hasPendingClaim, scoreResult] = await Promise.all([
      this.shared.getSectorNames(EntityKind.STARTUP, s.id),
      this.shared.getTeamMembers(EntityKind.STARTUP, s.id),
      this.rounds.find({ where: { startupId: s.id }, order: { date: "ASC" } }),
      this.shared.getProducts(EntityKind.STARTUP, s.id),
      this.shared.getContact(EntityKind.STARTUP, s.id),
      this.investments.findForTarget(EntityKind.STARTUP, s.id),
      s.verified === "unclaimed" ? this.organizations.pendingClaimForEntity(EntityKind.STARTUP, s.id) : Promise.resolve(false),
      this.scoring.getScoreForStartup(s.id),
    ]);
    const investorRows = investorLinks.length
      ? await this.investors.find({ where: { id: In(investorLinks.map((i) => i.investorId)) } })
      : [];
    // Public shape: composite score/status/confidence, and each factor's
    // number only. The richer diagnostic detail (reasons, inputs used/
    // missing, provenance, override audit) is admin-only — see
    // ScoringController — never sent here, unlike the old `sub` object this
    // replaces, which put six raw hardcoded-70 columns on the wire with no
    // gating at all.
    const factors = Object.fromEntries(
      Object.entries(scoreResult.factors).map(([key, f]) => [key, { score: f.score, confidence: f.confidence }]),
    );
    // foundedBasis is internal ML-data-quality metadata (is `founded` a stated year or an estimate?); it is never part of the public profile.
    const { foundedBasis: _internalFoundedBasis, ...publicFields } = s;
    return {
      ...publicFields,
      fundingTotal: Number(s.fundingTotal), valuation: Number(s.valuation),
      logo: initials(s.name), sectors, team, rounds, products, contact,
      investorIds: investorRows.map((v) => v.slug),
      hasPendingClaim,
      ruwadScore: s.ruwadScore != null ? Number(s.ruwadScore) : null,
      scoreStatus: s.scoreStatus,
      scoreConfidence: s.scoreConfidence != null ? Number(s.scoreConfidence) : null,
      scoreVersion: s.scoreVersion ?? null,
      factors,
    };
  }
}
