import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Startup } from "../startups/startup.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { ResearchProject, Publication } from "../research/research-child-entities.entity";
import { Multinational } from "../multinationals/multinational.entity";
import { Partnership } from "../directory-shared/partnership.entity";
import { EntityKind } from "../common/enums";
import { initials } from "../common/slug.util";

export interface EcosystemSnapshot {
  trackedFundingSar: number;
  startupCount: number;
  topCategory: { name: string; count: number } | null;
  activeInvestors: number;
  hubsCount: number;
  openHubsCount: number;
  researchCount: number;
  multinationalsCount: number;
}

export interface ChartDatum {
  l: string;
  v: number;
}

const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];

/** Every number here is computed from the live tables at request time — no
 * hardcoded dashboard figures. This service backs both the dashboard's
 * ecosystem snapshot and the full /analytics section (which previously
 * recomputed all of this client-side from local mock arrays — see
 * src/data/intelligence.ts on the frontend, now just a thin fetch layer
 * over these endpoints). */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(FundingRound) private readonly rounds: Repository<FundingRound>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(ResearchInstitution) private readonly research: Repository<ResearchInstitution>,
    @InjectRepository(ResearchProject) private readonly researchProjects: Repository<ResearchProject>,
    @InjectRepository(Publication) private readonly publications: Repository<Publication>,
    @InjectRepository(Multinational) private readonly multinationals: Repository<Multinational>,
    @InjectRepository(Partnership) private readonly partnerships: Repository<Partnership>,
  ) {}

  async ecosystemSnapshot(): Promise<EcosystemSnapshot> {
    const [startupCount, investorCount, hubsCount, openHubsCount, researchCount, multinationalsCount] = await Promise.all([
      this.startups.count(),
      this.investors.count(),
      this.hubs.count(),
      this.hubs.count({ where: { status: "Open" } }),
      this.research.count(),
      this.multinationals.count(),
    ]);

    const fundingTotal = await this.rounds
      .createQueryBuilder("r")
      .select("COALESCE(SUM(r.amount), 0)", "sum")
      .getRawOne<{ sum: string }>();

    const categoryRows = await this.startups
      .createQueryBuilder("s")
      .select("s.category", "category")
      .addSelect("COUNT(*)", "count")
      .groupBy("s.category")
      .orderBy("count", "DESC")
      .limit(1)
      .getRawOne<{ category: string; count: string }>();

    return {
      trackedFundingSar: Number(fundingTotal?.sum ?? 0),
      startupCount,
      topCategory: categoryRows ? { name: categoryRows.category, count: Number(categoryRows.count) } : null,
      activeInvestors: investorCount,
      hubsCount,
      openHubsCount,
      researchCount,
      multinationalsCount,
    };
  }

  /** `/analytics/overview` — the ecosystem-wide KPI row plus the row-level
   * "top N" panels every dashboard tab reads from. */
  async overview() {
    const [snapshot, dealCountRow, allRounds] = await Promise.all([
      this.ecosystemSnapshot(),
      this.rounds.count(),
      this.rounds.find(),
    ]);
    const totalFunding = allRounds.reduce((a, r) => a + Number(r.amount), 0);
    const avgDealSize = dealCountRow ? totalFunding / dealCountRow : 0;

    const [topFunded, highestScore, recentlyFounded, recentlyUpdated] = await Promise.all([
      this.startups.find({ order: { fundingTotal: "DESC" }, take: 5 }),
      this.startups.find({ order: { score: "DESC" }, take: 5 }),
      this.startups.find({ order: { founded: "DESC" }, take: 5 }),
      this.startups.find({ order: { provenanceLastUpdated: "DESC" }, take: 5 }),
    ]);
    const toRow = (s: Startup) => ({ id: s.id, slug: s.slug, name: s.name, logo: initials(s.name), category: s.category, fundingTotal: Number(s.fundingTotal), score: s.score, founded: s.founded, provenanceLastUpdated: s.provenanceLastUpdated });

    const recentRoundsRaw = await this.rounds.createQueryBuilder("r")
      .innerJoin(Startup, "s", "s.id = r.\"startupId\"")
      .select(["r.round AS round", "r.date AS date", "r.amount AS amount", "r.lead AS lead", "s.id AS \"startupId\"", "s.slug AS \"startupSlug\"", "s.name AS \"startupName\""])
      .orderBy("r.date", "DESC")
      .limit(8)
      .getRawMany();

    return {
      ...snapshot,
      totalDealCount: dealCountRow,
      avgDealSizeSar: avgDealSize,
      topFundedStartups: topFunded.map(toRow),
      highestScoreStartups: highestScore.map(toRow),
      recentlyFoundedStartups: recentlyFounded.map(toRow),
      recentlyUpdatedStartups: recentlyUpdated.map(toRow),
      recentFundingRounds: recentRoundsRaw.map((r) => ({ startup: r.startupName, startupId: r.startupId, startupSlug: r.startupSlug, round: r.round, date: r.date, amount: Number(r.amount), lead: r.lead })),
    };
  }

  /** `/analytics/funding-by-stage` */
  async fundingByStage(): Promise<{ fundingByStage: ChartDatum[]; dealsByStage: ChartDatum[] }> {
    const rows = await this.rounds.createQueryBuilder("r")
      .innerJoin(Startup, "s", "s.id = r.\"startupId\"")
      .select("s.stage", "stage")
      .addSelect("SUM(r.amount)", "amount")
      .addSelect("COUNT(*)", "deals")
      .groupBy("s.stage")
      .getRawMany<{ stage: string; amount: string; deals: string }>();
    const byStage = new Map(rows.map((r) => [r.stage, r]));
    const fundingByStage = STAGE_ORDER.filter((s) => byStage.has(s)).map((s) => ({ l: s, v: Math.round(Number(byStage.get(s)!.amount)) }));
    const dealsByStage = STAGE_ORDER.filter((s) => byStage.has(s)).map((s) => ({ l: s, v: Number(byStage.get(s)!.deals) }));
    return { fundingByStage, dealsByStage };
  }

  /** `/analytics/sector-distribution` */
  async sectorDistribution(): Promise<{ startupSectorCounts: ChartDatum[]; fundingBySector: ChartDatum[] }> {
    const rows = await this.startups.createQueryBuilder("s")
      .select("s.category", "category")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(s.fundingTotal)", "funding")
      .groupBy("s.category")
      .orderBy("count", "DESC")
      .getRawMany<{ category: string; count: string; funding: string }>();
    return {
      startupSectorCounts: rows.map((r) => ({ l: r.category, v: Number(r.count) })),
      fundingBySector: [...rows].sort((a, b) => Number(b.funding) - Number(a.funding)).map((r) => ({ l: r.category, v: Math.round(Number(r.funding)) })),
    };
  }

  /** `/analytics/geographic-distribution` */
  async geographicDistribution(): Promise<{ startupsByCity: ChartDatum[]; entitiesByCity: ChartDatum[] }> {
    const [startupCities, investorCities, hubCities] = await Promise.all([
      this.startups.createQueryBuilder("s").select("s.city", "city").addSelect("COUNT(*)", "count").groupBy("s.city").getRawMany<{ city: string; count: string }>(),
      this.investors.createQueryBuilder("v").select("v.city", "city").addSelect("COUNT(*)", "count").groupBy("v.city").getRawMany<{ city: string; count: string }>(),
      this.hubs.createQueryBuilder("h").select("h.city", "city").addSelect("COUNT(*)", "count").groupBy("h.city").getRawMany<{ city: string; count: string }>(),
    ]);
    const combined = new Map<string, number>();
    for (const list of [startupCities, investorCities, hubCities]) {
      for (const r of list) combined.set(r.city, (combined.get(r.city) ?? 0) + Number(r.count));
    }
    const startupsByCity = startupCities.sort((a, b) => Number(b.count) - Number(a.count)).map((r) => ({ l: r.city, v: Number(r.count) }));
    const entitiesByCity = [...combined.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));
    return { startupsByCity, entitiesByCity };
  }

  /** `/analytics/investor-activity` */
  async investorActivity() {
    const [mostActive, typeRows] = await Promise.all([
      this.investors.find({ order: { hcDeals: "DESC" }, take: 5 }),
      this.investors.createQueryBuilder("v").select("v.type", "type").addSelect("COUNT(*)", "count").groupBy("v.type").orderBy("count", "DESC").getRawMany<{ type: string; count: string }>(),
    ]);
    return {
      mostActiveInvestors: mostActive.map((v) => ({ id: v.id, slug: v.slug, name: v.name, logo: initials(v.name), type: v.type, city: v.city, hcDeals: v.hcDeals, stageFocus: v.stageFocus })),
      investorTypeCounts: typeRows.map((r) => ({ l: r.type, v: Number(r.count) })),
    };
  }

  /** `/analytics/research` */
  async researchAnalytics() {
    const institutions = await this.research.find();
    const [activeProjects, publicationsCount] = await Promise.all([
      this.researchProjects.count(),
      this.publications.count(),
    ]);
    const patents = institutions.reduce((a, r) => a + r.patentsCount, 0);
    const openCollaborations = institutions.filter((r) => r.collaborationStatus === "Open").length;

    const byFieldMap = new Map<string, number>();
    for (const r of institutions) {
      const field = r.coreResearchAreas?.[0];
      if (field) byFieldMap.set(field, (byFieldMap.get(field) ?? 0) + 1);
    }
    const byField = [...byFieldMap.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));

    const projectCounts = await this.researchProjects.createQueryBuilder("p")
      .select("p.\"researchInstitutionId\"", "id")
      .addSelect("COUNT(*)", "count")
      .groupBy("p.\"researchInstitutionId\"")
      .getRawMany<{ id: string; count: string }>();
    const countById = new Map(projectCounts.map((r) => [r.id, Number(r.count)]));
    const topInstitutions = [...institutions]
      .sort((a, b) => (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0))
      .slice(0, 6)
      .map((r) => ({ id: r.id, slug: r.slug, name: r.name, logo: initials(r.name), activeProjectCount: countById.get(r.id) ?? 0 }));

    return {
      summary: { institutions: institutions.length, activeProjects, publications: publicationsCount, patents, openCollaborations },
      byField,
      topInstitutions,
    };
  }

  /** `/analytics/multinationals` */
  async multinationalsAnalytics() {
    const list = await this.multinationals.find();
    const saudiOffices = list.filter((m) => m.saudiOffice).length;
    const rdCenters = list.reduce((a, m) => a + m.rdCenters, 0);
    const regionalPartnerships = await this.partnerships.count({ where: { entityType: EntityKind.MULTINATIONAL } });

    const bySectorMap = new Map<string, number>();
    for (const m of list) bySectorMap.set(m.category, (bySectorMap.get(m.category) ?? 0) + 1);
    const bySector = [...bySectorMap.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));

    const topByRd = [...list].sort((a, b) => b.rdCenters - a.rdCenters).slice(0, 6)
      .map((m) => ({ id: m.id, slug: m.slug, name: m.name, logo: initials(m.name), category: m.category, rdCenters: m.rdCenters }));

    return {
      summary: { companies: list.length, saudiOffices, rdCenters, regionalPartnerships },
      bySector,
      topByRd,
    };
  }
}
