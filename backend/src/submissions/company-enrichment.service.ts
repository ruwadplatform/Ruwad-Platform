import { Injectable, Logger } from "@nestjs/common";
import { hostOf, isBlockedHost } from "../content/content-utils";
import { parseOrgPage, type OrgPageInfo } from "../content/org-page.parser";
import { ResearchService, type ResearchItem } from "../content/research.service";
import { fetchHtml } from "../content/safe-fetch";
import { classifySource } from "../content/source-quality";
import { assessAuthoritative, assessFunding, parseFundingClaim, type FundingClaim } from "./public-research";
import { toSar } from "./autofill-pipeline";

/** Fills ONLY the fields a pitch deck left empty, using public information found through the shared Serper client
 * (same SERPER_API_KEY as News & Events) and the company's own website. The deck always wins; nothing here overwrites it.
 * Every search is cached for a week, so re-analyzing a deck for the same company costs no new searches. */

const MAX_SEARCHES = 5;
const REG_SITES = "(site:accessdata.fda.gov OR site:fda.gov OR site:sfda.gov.sa OR site:clinicaltrials.gov)";
const NOT_A_COMPANY_SITE = /(?:^|\.)(?:linkedin|facebook|instagram|twitter|x|youtube|tiktok|crunchbase|pitchbook|tracxn|zoominfo|craft|glassdoor|indeed|wikipedia|wikidata|medium|github|apple|google|bloomberg|reuters|zawya|wamda|magnitt|techcrunch|forbes|yellowpages|dnb|owler|rocketreach|cbinsights)\./i;

export interface EnrichmentSource { field: string; url: string; domain: string; type: string }
export interface EnrichmentResult { fields: Record<string, unknown>; sources: EnrichmentSource[]; searches: number; cached: number; note?: string }

const compact = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

@Injectable()
export class CompanyEnrichmentService {
  private readonly logger = new Logger(CompanyEnrichmentService.name);
  constructor(private readonly research: ResearchService) {}

  get enabled(): boolean { return this.research.enabled; }

  async enrich(fields: Record<string, unknown>): Promise<EnrichmentResult> {
    const empty: EnrichmentResult = { fields: {}, sources: [], searches: 0, cached: 0 };
    const name = typeof fields.name === "string" ? fields.name.trim() : "";
    if (!this.enabled || name.length < 3) return empty;
    const session = this.research.session(MAX_SEARCHES, { ttlHours: 24 * 7 });
    const out: Record<string, unknown> = {};
    const sources: EnrichmentSource[] = [];
    const use = (field: string, value: unknown, url: string, type: string) => {
      if (isEmpty(value) || !isEmpty(fields[field]) || !isEmpty(out[field])) return; // the deck (or an earlier step) already has it
      out[field] = value; sources.push({ field, url, domain: hostOf(url), type });
    };

    try {
      // Start the independent lookups together; the website check below needs its own results first.
      const websiteSearch = isEmpty(fields.website) ? session.run(`"${name}" official website`, { topic: "website" }) : null;
      const fundingNews = session.run(`"${name}" raises funding`, { kind: "news", tbs: "qdr:y", topic: "funding" });
      const fundingSearch = session.run(`"${name}" funding round investors`, { topic: "funding" });
      const regulatory = session.run(`"${name}" ${REG_SITES}`, { topic: "regulatory" });

      /* ------- official website (verified) and what it says about the company ------- */
      let siteUrl = typeof fields.website === "string" ? fields.website : "";
      let page: OrgPageInfo | null = null;
      const candidates: string[] = [];
      if (siteUrl) candidates.push(siteUrl);
      if (websiteSearch) {
        const r = await websiteSearch;
        if (r.knowledgeGraph?.website) candidates.push(r.knowledgeGraph.website);
        for (const it of r.items) {
          const host = hostOf(it.url);
          if (!host || isBlockedHost(it.url) || NOT_A_COMPANY_SITE.test(host + ".") || classifySource(it.url)) continue; // third-party sites are not "official"
          try { candidates.push(new URL(it.url).origin + "/"); } catch { /* skip malformed link */ }
        }
      }
      let checked = 0;
      for (const cand of [...new Set(candidates)]) {
        if (checked++ >= 3) break;
        const origin = (() => { try { return new URL(/^https?:/i.test(cand) ? cand : `https://${cand}`).origin + "/"; } catch { return ""; } })();
        if (!origin) continue;
        const got = await fetchHtml(origin);
        if (!got) continue;
        const info = parseOrgPage(got.html);
        const verified = [info.title, info.siteName, info.orgName].some((t) => t && compact(t).includes(compact(name)));
        if (!verified && cand !== fields.website) continue; // a search hit must prove it belongs to this company
        page = info; siteUrl = got.finalUrl.replace(/\/$/, ""); break;
      }
      const siteHost = siteUrl ? hostOf(siteUrl) : "";
      if (page) {
        const src = siteUrl;
        if (isEmpty(fields.website)) use("website", siteUrl, src, "official website");
        use("linkedin", page.linkedin, src, "official website");
        const d = page.description;
        if (d && d.length >= 40) { use("desc", d.slice(0, 2000), src, "official website"); use("tagline", d.length <= 150 ? d : "", src, "official website"); }
        if (page.foundingYear && page.foundingYear >= 1980 && page.foundingYear <= new Date().getFullYear()) use("founded", page.foundingYear, src, "official website");
        if (page.city || page.country) {
          use("hq", [page.city, page.country].filter(Boolean).join(", "), src, "official website");
          use("city", page.city, src, "official website"); use("country", page.country, src, "official website");
        }
        use("legalName", page.legalName, src, "official website");
        const mail = page.emails.find((e) => siteHost && e.toLowerCase().endsWith("@" + siteHost.replace(/^www\./, ""))) ?? (page.emails.length === 1 ? page.emails[0] : undefined);
        use("email", mail, src, "official website");
        use("phone", page.phones[0], src, "official website");
      }

      /* ------- LinkedIn company page, if the site didn't link to one ------- */
      if (isEmpty(fields.linkedin) && isEmpty(out.linkedin)) {
        const r = await session.run(`"${name}" linkedin company`, { topic: "linkedin" });
        const hit = r.items.find((it) => /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^/?#]+/i.test(it.url) && compact(it.title).startsWith(compact(name).slice(0, Math.max(3, compact(name).length))));
        if (hit) use("linkedin", hit.url.replace(/[?#].*$/, "").replace(/\/+$/, ""), hit.url, "LinkedIn company page");
      }

      /* ------- funding announcements (credible, corroborated) ------- */
      const hosts = new Set<string>(siteHost ? [siteHost.replace(/^www\./, "")] : []);
      const claims: FundingClaim[] = [];
      for (const it of [...(await fundingNews).items, ...(await fundingSearch).items] as ResearchItem[]) {
        const cls = classifySource(it.url, hosts);
        const claim = cls ? parseFundingClaim(it, name, cls) : null;
        if (claim) claims.push(claim);
      }
      const rounds = assessFunding(claims);
      if (rounds.length && isEmpty(fields.rounds)) {
        const rows = rounds.map((r) => {
          const sar = toSar(r.amount, r.currency);
          return { ...(r.round ? { round: r.round } : {}), ...(r.date ? { date: r.date } : {}), ...(sar !== undefined ? { amount: sar } : {}), ...(r.leads[0] ? { lead: r.leads.join(", ") } : {}) };
        }).filter((r) => Object.keys(r).length > 0);
        if (rows.length) { out.rounds = rows; for (const r of rounds) for (const s of r.sources) sources.push({ field: "rounds", url: s.url, domain: s.domain, type: s.type }); }
      }

      /* ------- regulatory / clinical: regulators' and registries' own pages only ------- */
      const reg = assessAuthoritative((await regulatory).items, name);
      for (const [field, value] of Object.entries(reg.fields)) {
        const s = reg.sources.find((x) => x.field === field);
        use(field, value, s?.url ?? "", "regulator / registry");
      }
    } catch (e) {
      this.logger.warn(`Company enrichment stopped early (${e instanceof Error ? e.message : "unknown error"})`);
    }

    const searches = session.serperCalls;
    this.logger.log(`Enrichment: ${searches} search(es), ${session.cacheHits} cached, ${Object.keys(out).length} field(s) added`);
    return { fields: out, sources, searches, cached: session.cacheHits };
  }
}
