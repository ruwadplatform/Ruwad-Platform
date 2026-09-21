import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { CompanyRow, Distribution, InternalStats, InvestorRow, Metric, ReportKind, ReportScope } from "./report-types";

const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];

export function formatSar(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "SAR 0";
  if (n >= 1e9) return `SAR ${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (n >= 1e6) return `SAR ${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `SAR ${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `SAR ${Math.round(n)}`;
}
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");

/** Every figure in a generated report comes from here: straight SQL over the RUWĀD database. No web data is ever mixed in. */
@Injectable()
export class ReportStatsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Website hosts of the companies RUWĀD lists — their own sites count as "official" sources. */
  async officialHosts(): Promise<Set<string>> {
    const rows: { website: string | null }[] = await this.db.query(`SELECT website FROM startups WHERE website IS NOT NULL`).catch(() => []);
    const out = new Set<string>();
    for (const r of rows) {
      try { const h = new URL(/^https?:/i.test(r.website ?? "") ? r.website! : `https://${r.website}`).hostname.toLowerCase().replace(/^www\./, ""); if (h.includes(".")) out.add(h); } catch { /* not a URL */ }
    }
    return out;
  }

  async build(kind: ReportKind, scope: ReportScope): Promise<InternalStats> {
    const sector = scope.sector?.trim() || undefined;
    const asOf = new Date().toISOString();
    const [{ total: startupsTotal }] = await this.db.query(`SELECT count(*)::int AS total FROM startups`);
    const [{ total: investorsTotal }] = await this.db.query(`SELECT count(*)::int AS total FROM investors`);
    const coverage = { startups: startupsTotal as number, investors: investorsTotal as number, asOf };

    if (kind === "STARTUP_ANALYSIS") return this.startupAnalysis(scope.startupSlug, coverage);

    const w = sector ? `WHERE category = $1` : "";
    const p = sector ? [sector] : [];
    const [s] = await this.db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE fundraising)::int AS fundraising, count(*) FILTER (WHERE "fundingTotal" > 0)::int AS funded,
              COALESCE(sum("fundingTotal"),0)::float AS funding, COALESCE(avg(employees),0)::float AS avg_emp, count(*) FILTER (WHERE founded >= 2020)::int AS recent,
              COUNT(DISTINCT city)::int AS cities FROM startups ${w}`, p);

    const metrics: Metric[] = [];
    const distributions: Distribution[] = [];
    const scopeNote = sector ? `startups in ${sector}` : "all startups on RUWĀD";

    if (kind !== "INVESTOR_LANDSCAPE") {
      metrics.push({ label: "Startups on RUWĀD", value: String(s.total), note: sector ? `in ${sector}` : "all sectors" });
      if (s.total > 0) {
        metrics.push({ label: "Currently fundraising", value: `${s.fundraising} (${pct(s.fundraising, s.total)})` });
        metrics.push({ label: "Founded since 2020", value: `${s.recent} (${pct(s.recent, s.total)})` });
        metrics.push({ label: "Average team size", value: String(Math.round(s.avg_emp)), note: "employees, as reported" });
        metrics.push({ label: "Cities represented", value: String(s.cities) });
      }
      metrics.push({ label: "Companies with recorded funding", value: `${s.funded} of ${s.total}` });
      metrics.push({ label: "Total recorded funding", value: formatSar(s.funding), note: `sum of funding reported by ${scopeNote}; not a market total` });

      const byStage: { l: string; v: number }[] = await this.db.query(`SELECT stage AS l, count(*)::int AS v FROM startups ${w} GROUP BY stage`, p);
      byStage.sort((a, b) => (STAGE_ORDER.indexOf(a.l) + 1 || 99) - (STAGE_ORDER.indexOf(b.l) + 1 || 99));
      distributions.push({ key: "stage", title: "Startups by stage", unit: "startups", rows: byStage });
      distributions.push({ key: "city", title: "Startups by city", unit: "startups", rows: await this.db.query(`SELECT city AS l, count(*)::int AS v FROM startups ${w} GROUP BY city ORDER BY v DESC, l LIMIT 8`, p) });
      if (!sector) distributions.push({ key: "sector", title: "Startups by sector", unit: "startups", rows: await this.db.query(`SELECT category AS l, count(*)::int AS v FROM startups GROUP BY category ORDER BY v DESC, l LIMIT 10`) });
      const fundByStage: { l: string; v: number }[] = await this.db.query(`SELECT stage AS l, COALESCE(sum("fundingTotal"),0)::float AS v FROM startups ${w} GROUP BY stage`, p);
      fundByStage.sort((a, b) => (STAGE_ORDER.indexOf(a.l) + 1 || 99) - (STAGE_ORDER.indexOf(b.l) + 1 || 99));
      distributions.push({ key: "fundingByStage", title: "Recorded funding by stage (SAR)", unit: "SAR", rows: fundByStage.filter((r) => r.v > 0) });
    }

    if (kind === "INVESTOR_LANDSCAPE" || kind === "FUNDING_LANDSCAPE" || kind === "SECTOR_OVERVIEW") {
      const [i] = await this.db.query(`SELECT count(*)::int AS total, COALESCE(sum("hcDeals"),0)::int AS hc, COALESCE(sum(investments),0)::int AS inv, COALESCE(sum(exits),0)::int AS exits FROM investors`);
      metrics.push({ label: "Investors on RUWĀD", value: String(i.total) });
      if (i.total > 0) {
        metrics.push({ label: "Healthcare deals recorded", value: String(i.hc), note: "as reported by investors on RUWĀD" });
        if (kind === "INVESTOR_LANDSCAPE") { metrics.push({ label: "Total investments recorded", value: String(i.inv) }); metrics.push({ label: "Exits recorded", value: String(i.exits) }); }
      }
      distributions.push({ key: "investorType", title: "Investors by type", unit: "investors", rows: await this.db.query(`SELECT type AS l, count(*)::int AS v FROM investors GROUP BY type ORDER BY v DESC, l`) });
      distributions.push({ key: "investorStages", title: "Investors by stage focus", unit: "investors", rows: await this.db.query(`SELECT st AS l, count(*)::int AS v FROM investors, unnest("stageFocus") AS st GROUP BY st ORDER BY v DESC, l LIMIT 8`) });
    }

    const companies: CompanyRow[] = kind === "INVESTOR_LANDSCAPE" ? [] : (await this.db.query(
      `SELECT slug, name, stage, city, category, "fundingTotal"::float AS "fundingTotal" FROM startups ${w} ORDER BY "fundingTotal" DESC, name LIMIT 10`, p));
    const investors: InvestorRow[] = kind === "STARTUP_LANDSCAPE" ? [] : (await this.db.query(`SELECT slug, name, type, city, "hcDeals"::int AS "hcDeals" FROM investors ORDER BY "hcDeals" DESC, name LIMIT 10`));

    return { coverage, metrics, distributions: distributions.filter((d) => d.rows.length > 0), companies, investors, subject: null };
  }

  private async startupAnalysis(slug: string | undefined, coverage: InternalStats["coverage"]): Promise<InternalStats> {
    const [s] = slug ? await this.db.query(`SELECT * FROM startups WHERE slug = $1`, [slug]) : [];
    if (!s) throw new NotFoundException("Startup not found");
    const [peer] = await this.db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE "fundingTotal" > $2)::int AS more_funded, count(*) FILTER (WHERE stage = $3)::int AS same_stage FROM startups WHERE category = $1 AND slug <> $4`,
      [s.category, Number(s.fundingTotal), s.stage, s.slug]);
    const facts: Metric[] = [
      { label: "Sector", value: s.category }, { label: "Stage", value: s.stage }, { label: "Location", value: [s.city, s.country].filter(Boolean).join(", ") },
      { label: "Founded", value: String(s.founded) }, { label: "Employees", value: String(s.employees) },
      { label: "Recorded funding", value: formatSar(Number(s.fundingTotal)) }, { label: "Valuation (as reported)", value: formatSar(Number(s.valuation)) },
      { label: "Currently fundraising", value: s.fundraising ? `Yes${s.targetRaise ? ` — ${s.targetRaise}` : ""}` : "No" },
      { label: "Regulatory (as recorded)", value: `SFDA ${s.sfda} · FDA ${s.fda} · CE ${s.ce}` },
    ];
    const peers: Metric[] = [
      { label: `Other ${s.category} startups on RUWĀD`, value: String(peer.total) },
      { label: "Peers with more recorded funding", value: `${peer.more_funded} of ${peer.total}` },
      { label: `Peers at the same stage (${s.stage})`, value: String(peer.same_stage) },
    ];
    const companies: CompanyRow[] = await this.db.query(
      `SELECT slug, name, stage, city, category, "fundingTotal"::float AS "fundingTotal" FROM startups WHERE category = $1 AND slug <> $2 ORDER BY "fundingTotal" DESC, name LIMIT 6`, [s.category, s.slug]);
    return { coverage, metrics: [...facts.slice(0, 4)], distributions: [], companies, investors: [], subject: { slug: s.slug, name: s.name, facts, peers } };
  }
}
