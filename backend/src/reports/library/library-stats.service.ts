import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { formatSarMillions } from "../report-stats.service";
import type { CompanyRow, Distribution, InternalStats, InvestorRow } from "../report-types";

type Row = { l: string; v: number };
const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];

/** Numbers behind a library report, all computed from the RUWĀD database at generation time. `categories` null = every sector. */
export interface LibraryRaw {
  asOf: string;
  categories: string[] | null;
  startupsTotal: number; startups: number; funded: number; fundraising: number; fundingSarM: number; medianFundingSarM: number; rounds: number;
  investorsTotal: number; investorsInGroup: number; investorsWithGroupDeals: number; investorHealthDeals: number;
  hubs: number; researchInstitutions: number; researchers: number; researchCenters: number; researchLabs: number; patents: number;
  multinationals: number; mncSaudiOffice: number; mncManufacturing: number; mncResearch: number; mncRegionalHq: number;
  stages: Row[]; cities: Row[]; investorTypes: Row[]; hubTypes: Row[]; hubCities: Row[]; researchTypes: Row[]; researchCities: Row[]; mncCategories: Row[];
}

const dist = (key: string, title: string, unit: string, rows: Row[]): Distribution => ({ key, title, unit, rows });

@Injectable()
export class LibraryStatsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async build(categories: string[] | null): Promise<{ stats: InternalStats; raw: LibraryRaw }> {
    const asOf = new Date().toISOString();
    const where = categories ? `WHERE category = ANY($1)` : "";
    const p = categories ? [categories] : [];
    const one = async <T,>(sql: string, params: unknown[] = []): Promise<T> => (await this.db.query(sql, params))[0] as T;
    const many = (sql: string, params: unknown[] = []): Promise<Row[]> => this.db.query(sql, params);

    const startupsTotal = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM startups`)).n;
    const s = await one<{ n: number; funded: number; fundraising: number; funding: number; median: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE "fundingTotal" > 0)::int AS funded, count(*) FILTER (WHERE fundraising)::int AS fundraising,
              COALESCE(sum("fundingTotal"),0)::float AS funding,
              COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY "fundingTotal") FILTER (WHERE "fundingTotal" > 0),0)::float AS median FROM startups ${where}`, p);
    const rounds = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM funding_rounds fr JOIN startups st ON st.id = fr."startupId" ${categories ? `WHERE st.category = ANY($1)` : ""}`, p)).n;

    const inv = await one<{ total: number; hc: number }>(`SELECT count(*)::int AS total, COALESCE(sum("hcDeals"),0)::int AS hc FROM investors`);
    const investorsInGroup = categories
      ? (await one<{ n: number }>(`SELECT count(DISTINCT iv.id)::int AS n FROM entity_sectors es JOIN sectors sc ON sc.id = es."sectorId" JOIN investors iv ON iv.id = es."entityId" WHERE es."entityType" = 'INVESTOR' AND sc.name = ANY($1)`, p)).n
      : inv.total;
    const investorsWithGroupDeals = (await one<{ n: number }>(
      `SELECT count(DISTINCT iv.id)::int AS n FROM investments i JOIN investors iv ON iv.id = i."investorId" JOIN startups st ON st.id = i."targetEntityId" WHERE i."targetEntityType" = 'STARTUP' ${categories ? `AND st.category = ANY($1)` : ""}`, p)).n;

    const r = await one<{ n: number; researchers: number; centers: number; labs: number; patents: number }>(
      `SELECT count(*)::int AS n, COALESCE(sum("numResearchers"),0)::int AS researchers, COALESCE(sum("numCenters"),0)::int AS centers, COALESCE(sum("numLabs"),0)::int AS labs, COALESCE(sum("patentsCount"),0)::int AS patents FROM research_institutions`);
    const m = await one<{ n: number; office: number; manufacturing: number; research: number; hq: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE "saudiOffice")::int AS office, count(*) FILTER (WHERE manufacturing)::int AS manufacturing,
              count(*) FILTER (WHERE "researchOperations")::int AS research, count(*) FILTER (WHERE "regionalHeadquarters")::int AS hq FROM multinationals`);
    const hubs = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM hubs`)).n;

    const stages = await many(`SELECT stage AS l, count(*)::int AS v FROM startups ${where} GROUP BY stage`, p);
    stages.sort((a, b) => (STAGE_ORDER.indexOf(a.l) + 1 || 99) - (STAGE_ORDER.indexOf(b.l) + 1 || 99));
    const raw: LibraryRaw = {
      asOf, categories, startupsTotal, startups: s.n, funded: s.funded, fundraising: s.fundraising, fundingSarM: s.funding, medianFundingSarM: s.median, rounds,
      investorsTotal: inv.total, investorsInGroup, investorsWithGroupDeals, investorHealthDeals: inv.hc,
      hubs, researchInstitutions: r.n, researchers: r.researchers, researchCenters: r.centers, researchLabs: r.labs, patents: r.patents,
      multinationals: m.n, mncSaudiOffice: m.office, mncManufacturing: m.manufacturing, mncResearch: m.research, mncRegionalHq: m.hq,
      stages, cities: await many(`SELECT city AS l, count(*)::int AS v FROM startups ${where} GROUP BY city ORDER BY v DESC, l LIMIT 8`, p),
      investorTypes: await many(`SELECT type AS l, count(*)::int AS v FROM investors GROUP BY type ORDER BY v DESC, l`),
      hubTypes: await many(`SELECT type AS l, count(*)::int AS v FROM hubs GROUP BY type ORDER BY v DESC, l`),
      hubCities: await many(`SELECT city AS l, count(*)::int AS v FROM hubs GROUP BY city ORDER BY v DESC, l LIMIT 8`),
      researchTypes: await many(`SELECT type AS l, count(*)::int AS v FROM research_institutions GROUP BY type ORDER BY v DESC, l`),
      researchCities: await many(`SELECT city AS l, count(*)::int AS v FROM research_institutions GROUP BY city ORDER BY v DESC, l LIMIT 8`),
      mncCategories: await many(`SELECT category AS l, count(*)::int AS v FROM multinationals GROUP BY category ORDER BY v DESC, l LIMIT 8`),
    };

    const fundingByStage = (await many(`SELECT stage AS l, round(COALESCE(sum("fundingTotal"),0)::numeric, 2)::float AS v FROM startups ${where} GROUP BY stage`, p))
      .filter((x) => x.v > 0).sort((a, b) => (STAGE_ORDER.indexOf(a.l) + 1 || 99) - (STAGE_ORDER.indexOf(b.l) + 1 || 99));
    const companies: CompanyRow[] = await this.db.query(`SELECT slug, name, stage, city, category, "fundingTotal"::float AS "fundingTotal" FROM startups ${where} ORDER BY "fundingTotal" DESC, name LIMIT 10`, p);
    const investors: InvestorRow[] = await this.db.query(`SELECT slug, name, type, city, "hcDeals"::int AS "hcDeals" FROM investors ORDER BY "hcDeals" DESC, name LIMIT 10`);

    const distributions = [
      dist("stage", categories ? "Startups by stage" : "Startups by stage (all sectors)", "startups", raw.stages),
      dist("city", "Startups by city", "startups", raw.cities),
      dist("fundingByStage", "Recorded funding by stage (SAR millions)", "SAR M", fundingByStage),
      dist("investorType", "Investors by type", "investors", raw.investorTypes),
      dist("hubType", "Hubs & enablers by type", "hubs", raw.hubTypes),
      dist("hubCity", "Hubs & enablers by city", "hubs", raw.hubCities),
      dist("researchType", "Research institutions by type", "institutions", raw.researchTypes),
      dist("researchCity", "Research institutions by city", "institutions", raw.researchCities),
      dist("mncCategory", "Multinationals by category", "companies", raw.mncCategories),
    ].filter((d) => d.rows.length > 0);

    const stats: InternalStats = {
      coverage: { startups: startupsTotal, investors: inv.total, asOf },
      metrics: [
        { label: categories ? "Startups in this sector group" : "Startups on RUWĀD", value: String(s.n) },
        ...(s.funded > 0 ? [{ label: "Total recorded funding", value: formatSarMillions(s.funding), note: "sum of funding reported on RUWĀD company profiles; not a market total" }] : []),
      ],
      distributions, companies: s.n ? companies : [], investors, subject: null,
    };
    return { stats, raw };
  }
}
