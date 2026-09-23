import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { CompanyRow, Distribution, FundingSoughtRow, InternalStats, InvestorRow, Metric, ProfileSection, ReportKind, ReportScope } from "./report-types";

const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];
/** Text that means "no real value recorded" — such fields are reported as missing, never as data. */
const PLACEHOLDER = /^\s*(|—|-|–|n\/?a|none|tbd|unknown|not (publicly )?(disclosed|available|specified)|pending)\s*$/i;

/** RUWĀD stores startup funding and valuation in SAR **millions** (every page shows them as "SAR 15M"). */
export function formatSarMillions(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "SAR 0";
  if (m >= 1000) return `SAR ${(m / 1000).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (m >= 100) return `SAR ${Math.round(m)}M`;
  if (m >= 10) return `SAR ${m.toFixed(1).replace(/\.0$/, "")}M`;
  return `SAR ${m.toFixed(2).replace(/\.?0+$/, "")}M`;
}
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");
const isReal = (v: unknown) => v !== null && v !== undefined && !PLACEHOLDER.test(String(v));
const item = (label: string, v: unknown) => (isReal(v) ? { label, value: String(v) } : null);
const compact = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

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
              COUNT(DISTINCT city)::int AS cities, COUNT(DISTINCT country)::int AS countries,
              COALESCE(avg("fundingTotal") FILTER (WHERE "fundingTotal" > 0),0)::float AS avg_funding,
              COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY "fundingTotal") FILTER (WHERE "fundingTotal" > 0),0)::float AS median_funding
         FROM startups ${w}`, p);

    const metrics: Metric[] = [];
    const distributions: Distribution[] = [];
    const scopeNote = sector ? `startups in ${sector}` : "all startups on RUWĀD";
    let fundingSought: FundingSoughtRow[] = [];

    if (kind !== "INVESTOR_LANDSCAPE") {
      metrics.push({ label: "Startups on RUWĀD", value: String(s.total), note: sector ? `in ${sector}` : "all sectors" });
      if (s.total > 0) {
        if (s.fundraising > 0) metrics.push({ label: "Active funding rounds", value: `${s.fundraising} (${pct(s.fundraising, s.total)})`, note: "startups that mark themselves as currently fundraising" });
        if (s.recent > 0) metrics.push({ label: "Founded since 2020", value: `${s.recent} (${pct(s.recent, s.total)})` });
        if (s.avg_emp > 0) metrics.push({ label: "Average team size", value: String(Math.round(s.avg_emp)), note: "employees, as reported" });
        if (s.cities > 0) metrics.push({ label: "Cities represented", value: String(s.cities) });
      }
      if (s.funded > 0) {
        metrics.push({ label: "Companies with recorded funding", value: `${s.funded} of ${s.total}` });
        metrics.push({ label: "Total recorded funding", value: formatSarMillions(s.funding), note: `sum of funding raised as reported by ${scopeNote}; not a market total` });
        metrics.push({ label: "Average recorded funding", value: formatSarMillions(s.avg_funding), note: "per company with recorded funding" });
        metrics.push({ label: "Median recorded funding", value: formatSarMillions(s.median_funding), note: "per company with recorded funding" });
      }
      const [r] = await this.db.query(`SELECT count(*)::int AS n FROM funding_rounds fr JOIN startups st ON st.id = fr."startupId" ${sector ? `WHERE st.category = $1` : ""}`, p);
      if (r.n > 0) metrics.push({ label: "Funding rounds recorded", value: String(r.n), note: "individual rounds on startup profiles" });

      const byStage: { l: string; v: number }[] = await this.db.query(`SELECT stage AS l, count(*)::int AS v FROM startups ${w} GROUP BY stage`, p);
      byStage.sort((a, b) => (STAGE_ORDER.indexOf(a.l) + 1 || 99) - (STAGE_ORDER.indexOf(b.l) + 1 || 99));
      distributions.push({ key: "stage", title: "Startups by stage", unit: "startups", rows: byStage });
      distributions.push({ key: "city", title: "Startups by city", unit: "startups", rows: await this.db.query(`SELECT city AS l, count(*)::int AS v FROM startups ${w} GROUP BY city ORDER BY v DESC, l LIMIT 8`, p) });
      if (s.countries > 1) distributions.push({ key: "country", title: "Startups by country", unit: "startups", rows: await this.db.query(`SELECT country AS l, count(*)::int AS v FROM startups ${w} GROUP BY country ORDER BY v DESC, l LIMIT 8`, p) });
      distributions.push({ key: "foundingYear", title: "Startups by founding year", unit: "startups", rows: await this.db.query(`SELECT founded::text AS l, count(*)::int AS v FROM startups ${w} GROUP BY founded ORDER BY founded`, p) });
      if (!sector) {
        distributions.push({ key: "sector", title: "Startups by sector", unit: "startups", rows: await this.db.query(`SELECT category AS l, count(*)::int AS v FROM startups GROUP BY category ORDER BY v DESC, l LIMIT 10`) });
        distributions.push({ key: "fundingBySector", title: "Recorded funding by sector (SAR millions)", unit: "SAR M", rows: await this.db.query(`SELECT category AS l, round(sum("fundingTotal")::numeric, 2)::float AS v FROM startups GROUP BY category HAVING sum("fundingTotal") > 0 ORDER BY v DESC, l LIMIT 10`) });
      }
      const fundByStage: { l: string; v: number }[] = await this.db.query(`SELECT stage AS l, round(COALESCE(sum("fundingTotal"),0)::numeric, 2)::float AS v FROM startups ${w} GROUP BY stage`, p);
      fundByStage.sort((a, b) => (STAGE_ORDER.indexOf(a.l) + 1 || 99) - (STAGE_ORDER.indexOf(b.l) + 1 || 99));
      distributions.push({ key: "fundingByStage", title: "Recorded funding by stage (SAR millions)", unit: "SAR M", rows: fundByStage.filter((x) => x.v > 0) });
      distributions.push({ key: "fundingByCompany", title: "Recorded funding by company (SAR millions)", unit: "SAR M", rows: await this.db.query(`SELECT name AS l, round("fundingTotal"::numeric, 2)::float AS v FROM startups ${w ? `${w} AND` : "WHERE"} "fundingTotal" > 0 ORDER BY "fundingTotal" DESC, name LIMIT 8`, p) });

      fundingSought = await this.db.query(`SELECT slug, name, stage, "targetRaise" AS target FROM startups ${w ? `${w} AND` : "WHERE"} fundraising = true AND "targetRaise" IS NOT NULL AND btrim("targetRaise") <> '' ORDER BY name LIMIT 20`, p);
    }

    if (kind === "INVESTOR_LANDSCAPE" || kind === "FUNDING_LANDSCAPE" || kind === "SECTOR_OVERVIEW") {
      const [i] = await this.db.query(`SELECT count(*)::int AS total, COALESCE(sum("hcDeals"),0)::int AS hc, COALESCE(sum(investments),0)::int AS inv, COALESCE(sum(exits),0)::int AS exits,
                                              count(*) FILTER (WHERE ticket !~* '^\\s*(not (publicly )?disclosed|n/?a|unknown|—|-)?\\s*$')::int AS ticket_disclosed FROM investors`);
      metrics.push({ label: "Investors on RUWĀD", value: String(i.total) });
      if (i.total > 0) {
        if (i.hc > 0) metrics.push({ label: "Healthcare deals recorded", value: String(i.hc), note: "as reported by investors on RUWĀD" });
        if (kind === "INVESTOR_LANDSCAPE") {
          if (i.inv > 0) metrics.push({ label: "Total investments recorded", value: String(i.inv) });
          if (i.exits > 0) metrics.push({ label: "Exits recorded", value: String(i.exits) });
          if (i.ticket_disclosed > 0) metrics.push({ label: "Investors disclosing a ticket size", value: `${i.ticket_disclosed} of ${i.total}` });
        }
        const [links] = await this.db.query(`SELECT count(*)::int AS n FROM investments inv JOIN investors iv ON iv.id = inv."investorId" JOIN startups st ON st.id = inv."targetEntityId" WHERE inv."targetEntityType" = 'STARTUP'`);
        if (links.n > 0 && kind === "INVESTOR_LANDSCAPE") metrics.push({ label: "Investments linked to RUWĀD companies", value: String(links.n) });
      }
      distributions.push({ key: "investorType", title: "Investors by type", unit: "investors", rows: await this.db.query(`SELECT type AS l, count(*)::int AS v FROM investors GROUP BY type ORDER BY v DESC, l`) });
      distributions.push({ key: "investorStages", title: "Investors by preferred stage", unit: "investors", rows: await this.db.query(`SELECT st AS l, count(*)::int AS v FROM investors, unnest("stageFocus") AS st GROUP BY st ORDER BY v DESC, l LIMIT 8`) });
      if (kind === "INVESTOR_LANDSCAPE") {
        distributions.push({ key: "investorSectors", title: "Investors by preferred sector", unit: "investors", rows: await this.db.query(`SELECT sc.name AS l, count(*)::int AS v FROM entity_sectors es JOIN sectors sc ON sc.id = es."sectorId" JOIN investors iv ON iv.id = es."entityId" WHERE es."entityType" = 'INVESTOR' GROUP BY sc.name ORDER BY v DESC, l LIMIT 8`) });
        distributions.push({ key: "investorTicket", title: "Investors by ticket size (where disclosed)", unit: "investors", rows: await this.db.query(`SELECT ticket AS l, count(*)::int AS v FROM investors WHERE ticket !~* '^\\s*(not (publicly )?disclosed|n/?a|unknown|—|-)?\\s*$' GROUP BY ticket ORDER BY v DESC, l LIMIT 8`) });
        distributions.push({ key: "investorCity", title: "Investors by headquarters city", unit: "investors", rows: await this.db.query(`SELECT city AS l, count(*)::int AS v FROM investors GROUP BY city ORDER BY v DESC, l LIMIT 8`) });
      }
    }

    let ecosystem: Metric[] | undefined;
    if (kind === "SECTOR_OVERVIEW") {
      const [e] = await this.db.query(`SELECT (SELECT count(*) FROM hubs)::int AS hubs, (SELECT count(*) FROM research_institutions)::int AS research, (SELECT count(*) FROM multinationals)::int AS mnc`);
      const rows: (Metric | null)[] = [
        e.hubs > 0 ? { label: "Hubs & enablers", value: String(e.hubs), note: "all sectors on RUWĀD" } : null,
        e.research > 0 ? { label: "Research institutions", value: String(e.research), note: "all sectors on RUWĀD" } : null,
        e.mnc > 0 ? { label: "Multinationals", value: String(e.mnc), note: "all sectors on RUWĀD" } : null,
      ];
      ecosystem = compact(rows);
      metrics.push(...ecosystem);
    }

    const companies: CompanyRow[] = kind === "INVESTOR_LANDSCAPE" ? [] : (await this.db.query(
      `SELECT slug, name, stage, city, category, "fundingTotal"::float AS "fundingTotal" FROM startups ${w} ORDER BY "fundingTotal" DESC, name LIMIT 10`, p));
    const investors: InvestorRow[] = kind === "STARTUP_LANDSCAPE" ? [] : (await this.db.query(`SELECT slug, name, type, city, "hcDeals"::int AS "hcDeals" FROM investors ORDER BY "hcDeals" DESC, name LIMIT 10`));

    return { coverage, metrics, distributions: distributions.filter((d) => d.rows.length > 0), companies, investors, fundingSought, ecosystem, subject: null };
  }

  private async startupAnalysis(slug: string | undefined, coverage: InternalStats["coverage"]): Promise<InternalStats> {
    const [s] = slug ? await this.db.query(`SELECT * FROM startups WHERE slug = $1`, [slug]) : [];
    if (!s) throw new NotFoundException("Startup not found");
    const funding = Number(s.fundingTotal);
    const [peer] = await this.db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE "fundingTotal" > $2)::int AS more_funded, count(*) FILTER (WHERE stage = $3)::int AS same_stage FROM startups WHERE category = $1 AND slug <> $4`,
      [s.category, funding, s.stage, s.slug]);
    const [team, products, backers, rounds]: Record<string, unknown>[][] = await Promise.all([
      this.db.query(`SELECT name, title, "isFounder" FROM team_members WHERE "entityType" = 'STARTUP' AND "entityId" = $1 ORDER BY "isFounder" DESC, name`, [s.id]),
      this.db.query(`SELECT name, category, description FROM products WHERE "entityType" = 'STARTUP' AND "entityId" = $1 ORDER BY name`, [s.id]),
      this.db.query(`SELECT i.name, inv.round, inv.year FROM investments inv JOIN investors i ON i.id = inv."investorId" WHERE inv."targetEntityType" = 'STARTUP' AND inv."targetEntityId" = $1 ORDER BY inv.year DESC NULLS LAST, i.name`, [s.id]),
      this.db.query(`SELECT round, date, amount::float AS amount, lead FROM funding_rounds WHERE "startupId" = $1 ORDER BY date DESC`, [s.id]),
    ]);

    const facts: Metric[] = [
      { label: "Sector", value: s.category }, { label: "Stage", value: s.stage }, { label: "Location", value: [s.city, s.country].filter(Boolean).join(", ") },
      { label: "Founded", value: String(s.founded) }, { label: "Employees", value: String(s.employees) },
      { label: "Recorded funding", value: formatSarMillions(funding) }, { label: "Valuation (as reported)", value: formatSarMillions(Number(s.valuation)) },
      { label: "Currently fundraising", value: s.fundraising ? `Yes${isReal(s.targetRaise) ? ` — seeking ${s.targetRaise}` : ""}` : "No" },
      { label: "Regulatory (as recorded)", value: `SFDA ${s.sfda} · FDA ${s.fda} · CE ${s.ce}` },
    ];
    const peers: Metric[] = [
      { label: `Other ${s.category} startups on RUWĀD`, value: String(peer.total) },
      { label: "Peers with more recorded funding", value: `${peer.more_funded} of ${peer.total}` },
      { label: `Peers at the same stage (${s.stage})`, value: String(peer.same_stage) },
    ];

    const roundLine = (r: Record<string, unknown>) => `${r.round} · ${r.date} · ${formatSarMillions(Number(r.amount))}${isReal(r.lead) ? ` · lead: ${r.lead}` : ""}`;
    const profile: ProfileSection[] = [
      { heading: "Company overview", items: compact([item("Tagline", s.tagline), item("Headquarters", s.hq), item("Business model", s.businessModel), item("Status", s.status), item("Founded", s.founded), item("Team size", Number(s.employees) > 0 ? s.employees : null), item("Website", s.website)]) },
      { heading: "Product / technology", items: compact([item("Description", s.desc), item("Problem", s.problem), item("Solution", s.solution), item("Competitive advantage", s.advantage), ...products.map((x) => item(`Product: ${x.name}`, [x.category, x.description].filter(isReal).join(" — ")))]) },
      { heading: "Market", items: compact([item("Total addressable market (as recorded)", s.marketTam), item("Serviceable addressable market (as recorded)", s.marketSam), item("Serviceable obtainable market (as recorded)", s.marketSom), item("Competitors named", (s.marketCompetitors as string[] | null)?.filter(isReal).join(", "))]) },
      { heading: "Funding", items: compact([item("Recorded funding", funding > 0 ? formatSarMillions(funding) : null), item("Valuation (as reported)", Number(s.valuation) > 0 ? formatSarMillions(Number(s.valuation)) : null), item("Currently fundraising", s.fundraising ? "Yes" : null), item("Funding being sought (company's stated target)", s.fundraising ? s.targetRaise : null), ...rounds.map((r, i) => item(`Round ${i + 1}`, roundLine(r)))]) },
      { heading: "Investors", items: compact(backers.map((b) => item(String(b.name), [b.round, b.year].filter(isReal).join(", ") || "Investment recorded"))) },
      { heading: "Traction", items: compact([item("Funding rounds recorded", rounds.length || null), item("Investors linked on RUWĀD", backers.length || null), item("Products listed", products.length || null)]) },
      { heading: "Clinical / regulatory", items: compact([item("SFDA", s.sfda), item("FDA", s.fda), item("CE", s.ce), item("Clinical status", s.clinicalStatus), item("Patent status", s.patentStatus)]) },
      { heading: "Team", items: compact(team.map((t) => item(String(t.name), `${t.title}${t.isFounder ? " (founder)" : ""}`))) },
    ];

    const missing: string[] = [];
    for (const sec of profile) if (!sec.items.length) missing.push(`${sec.heading}: nothing is recorded for this company on RUWĀD.`);
    for (const [label, value] of [["Valuation", Number(s.valuation) > 0 ? "ok" : ""], ["Total addressable market", s.marketTam], ["Clinical status", s.clinicalStatus], ["Patent status", s.patentStatus], ["SFDA status", s.sfda], ["Website", s.website]] as [string, unknown][]) {
      if (!isReal(value)) missing.push(`${label} is not recorded.`);
    }
    if (!rounds.length) missing.push("No individual funding rounds are recorded.");
    if (!team.length) missing.push("No team members are listed.");
    missing.push("Revenue, customer and usage figures are not recorded on RUWĀD. Documents in the data room are not used in these reports.");

    const companies: CompanyRow[] = await this.db.query(
      `SELECT slug, name, stage, city, category, "fundingTotal"::float AS "fundingTotal" FROM startups WHERE category = $1 AND slug <> $2 ORDER BY "fundingTotal" DESC, name LIMIT 6`, [s.category, s.slug]);
    return { coverage, metrics: facts.slice(0, 4), distributions: [], companies, investors: [], subject: { slug: s.slug, name: s.name, facts, peers, profile: profile.filter((x) => x.items.length), missing } };
  }
}
