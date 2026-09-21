import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResearchService, type QueryLog } from "../content/research.service";
import { Report } from "./report.entity";
import { ReportAiService } from "./report-ai.service";
import { MAX_REPORT_QUERIES, buildSources, researchPlan, researchStatus, type PlanItem } from "./report-sources";
import { ReportStatsService } from "./report-stats.service";
import { ReportsService } from "./reports.service";
import { REPORT_KIND_LABEL, type ExternalSource, type GeneratedContent, type InternalStats, type ReportKind, type ReportScope } from "./report-types";

const COVERAGE_NOTICE = "This report combines RUWĀD platform data with publicly available external sources retrieved through web search. RUWĀD data may not represent the complete Saudi healthcare ecosystem.";
const SECTOR_CATEGORY: Record<string, string> = { "Digital Health": "Digital Health", Biotechnology: "Biotechnology", MedTech: "MedTech", Diagnostics: "Diagnostics", Pharmaceuticals: "Pharmaceuticals" };

interface Composed {
  stats: InternalStats; sources: ExternalSource[]; queries: QueryLog[];
  generated: GeneratedContent; mode: "ai" | "no-ai"; aiOverview: string | null; serperCalls: number; allFailed: boolean;
}

/** Builds a report from two clearly separated ingredients: statistics computed from the RUWĀD database, and web sources
 * found through the shared Serper client. It never turns snippets into numbers and never writes prose the data doesn't support. */
@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);
  private readonly busy = new Set<string>();

  constructor(
    @InjectRepository(Report) private readonly repo: Repository<Report>,
    private readonly reports: ReportsService,
    private readonly stats: ReportStatsService,
    private readonly research: ResearchService,
    private readonly ai: ReportAiService,
  ) {}

  static title(kind: ReportKind, scope: ReportScope, subjectName?: string): string {
    const sector = scope.sector?.trim();
    switch (kind) {
      case "SECTOR_OVERVIEW": return `Saudi ${sector ?? "Healthcare"} Landscape`;
      case "STARTUP_LANDSCAPE": return `Saudi ${sector ?? "Healthcare"} Startup Landscape`;
      case "FUNDING_LANDSCAPE": return `Saudi ${sector ?? "Healthcare"} Funding Landscape`;
      case "INVESTOR_LANDSCAPE": return sector ? `Saudi ${sector} Investor Landscape` : "Saudi Investor Landscape";
      case "STARTUP_ANALYSIS": return `${subjectName ?? "Startup"}: Startup Analysis`;
    }
  }

  async generate(kind: ReportKind, scope: ReportScope): Promise<Report> {
    const lockKey = `new:${kind}:${scope.sector ?? ""}:${scope.startupSlug ?? ""}`;
    this.lock(lockKey);
    try {
      const stats = await this.stats.build(kind, scope); // also validates the startup for STARTUP_ANALYSIS
      const title = ReportGeneratorService.title(kind, scope, stats.subject?.name);
      const composed = await this.compose(kind, scope, stats, { force: false });
      const today = new Date().toISOString().slice(0, 10);
      const report = this.repo.create({
        slug: await this.reports.uniqueSlug(title), title,
        category: SECTOR_CATEGORY[scope.sector ?? ""] ?? "Market Intelligence", reportType: REPORT_KIND_LABEL[kind], publicationDate: today,
        ...this.legacyFields(composed, scope),
        isPublished: false, reportKind: kind, scope, publishedAt: undefined,
        ...this.storedFields(composed),
      });
      return await this.repo.save(report);
    } finally {
      this.busy.delete(lockKey);
    }
  }

  /** Explicit refresh: re-runs the web research (bypassing the cache) and recomputes the RUWĀD statistics. */
  async refreshResearch(id: string): Promise<Report> {
    const report = await this.reports.findEntityOrThrow(id);
    if (!report.reportKind) throw new BadRequestException("Only generated reports have external research to refresh");
    this.lock(`id:${id}`);
    try {
      const kind = report.reportKind as ReportKind;
      const scope = report.scope ?? {};
      const stats = await this.stats.build(kind, scope);
      const composed = await this.compose(kind, scope, stats, { force: true, previous: report });
      Object.assign(report, this.legacyFields(composed, scope), this.storedFields(composed), { publicationDate: new Date().toISOString().slice(0, 10) });
      return await this.repo.save(report);
    } finally {
      this.busy.delete(`id:${id}`);
    }
  }

  private lock(key: string) {
    if (this.busy.has(key)) throw new ConflictException("This report is already being generated. Please wait a moment.");
    this.busy.add(key);
  }

  private async compose(kind: ReportKind, scope: ReportScope, stats: InternalStats, opts: { force: boolean; previous?: Report }): Promise<Composed> {
    const plan: PlanItem[] = researchPlan(kind, scope, stats.subject?.name).slice(0, MAX_REPORT_QUERIES);
    const session = this.research.session(MAX_REPORT_QUERIES, { force: opts.force, ttlHours: 24 });
    const results = await Promise.all(plan.map((p) => session.run(p.query, { kind: p.kind, topic: p.topic, tbs: p.tbs, num: 10 })));
    const now = new Date();
    const officialHosts = await this.stats.officialHosts();
    const hits = results.flatMap((r, i) => r.items.map((item) => ({ item, plan: plan[i] })));
    let sources = buildSources(hits, { officialHosts, scope, subjectName: stats.subject?.name, now }, now.toISOString());

    const status = researchStatus(session.log, this.research.enabled || session.cacheHits > 0);
    let note: string | undefined;
    if ((status === "unavailable" || status === "disabled") && opts.previous?.externalSources?.length) {
      // A failed refresh must not wipe good evidence: keep what the report already had and say so.
      sources = opts.previous.externalSources;
      note = `The latest refresh could not reach the search service, so the sources saved on ${opts.previous.researchedAt?.toISOString().slice(0, 10) ?? "an earlier date"} are shown.`;
    } else if (status === "disabled") note = "External research is not configured on this server, so this report contains RUWĀD platform data only.";
    else if (status === "unavailable") note = "External research was unavailable when this report was generated, so it contains RUWĀD platform data only. An admin can refresh the research later.";

    const scopeLabel = scope.sector ? `Saudi ${scope.sector}` : "Saudi healthcare";
    const overviewLines = this.overviewLines(kind, stats, sources, scopeLabel);
    const aiOverview = this.ai.available && sources.length > 0 ? await this.ai.overview({ scopeLabel, metrics: stats.metrics, sources }) : null;
    const generated: GeneratedContent = {
      overviewLines, coverageNotice: COVERAGE_NOTICE, scopeLabel,
      methodology: this.methodology(session.log.length, session.serperCalls, session.cacheHits, sources.length, aiOverview !== null),
      research: { status: note && opts.previous ? "partial" : status, searchesUsed: session.serperCalls, cacheHits: session.cacheHits, sourcesKept: sources.length, note },
    };
    this.logger.log(`Report ${kind}: ${session.serperCalls} search(es), ${session.cacheHits} cached, ${sources.length} sources kept, mode ${aiOverview ? "ai" : "no-ai"}`);
    return { stats, sources, queries: session.log, generated, mode: aiOverview ? "ai" : "no-ai", aiOverview, serperCalls: session.serperCalls, allFailed: status === "unavailable" || status === "disabled" };
  }

  /** Plain statements built only from computed numbers and retrieved sources. No conclusions, forecasts or market sizes. */
  private overviewLines(kind: ReportKind, stats: InternalStats, sources: ExternalSource[], scopeLabel: string): string[] {
    const m = (label: string) => stats.metrics.find((x) => x.label === label)?.value;
    const lines: string[] = [];
    if (stats.subject) {
      const f = (label: string) => stats.subject!.facts.find((x) => x.label === label)?.value;
      lines.push(`RUWĀD lists ${stats.subject.name} as a ${f("Stage")} ${f("Sector")} company based in ${f("Location")}, founded in ${f("Founded")}.`);
      lines.push(`Recorded funding on RUWĀD: ${f("Recorded funding")}.`);
      const peerTotal = stats.subject.peers[0]?.value;
      if (peerTotal) lines.push(`RUWĀD lists ${peerTotal} other startups in the same sector for comparison.`);
    } else {
      const startups = m("Startups on RUWĀD");
      if (kind !== "INVESTOR_LANDSCAPE" && startups) {
        lines.push(`RUWĀD lists ${startups} startups${stats.metrics[0]?.note?.startsWith("in ") ? ` ${stats.metrics[0].note}` : ""}; ${m("Companies with recorded funding") ?? "0"} have recorded funding, totalling ${m("Total recorded funding") ?? "SAR 0"}.`);
        const stage = stats.distributions.find((d) => d.key === "stage")?.rows.slice().sort((a, b) => b.v - a.v)[0];
        if (stage) lines.push(`The most common stage on RUWĀD is ${stage.l} (${stage.v} startups).`);
        const city = stats.distributions.find((d) => d.key === "city")?.rows[0];
        if (city) lines.push(`The most common city is ${city.l} (${city.v} startups).`);
      }
      if (m("Investors on RUWĀD")) {
        const t = stats.distributions.find((d) => d.key === "investorType")?.rows[0];
        lines.push(`RUWĀD lists ${m("Investors on RUWĀD")} investors${t ? `; the most common type is ${t.l} (${t.v})` : ""}.`);
      }
    }
    if (sources.length) {
      const byType = new Map<string, number>();
      for (const s of sources) byType.set(s.sourceTypeLabel, (byType.get(s.sourceTypeLabel) ?? 0) + 1);
      lines.push(`External research for ${scopeLabel} retrieved ${sources.length} sources (${[...byType].map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ")}). They are listed below with their original text and links; RUWĀD has not combined them into market figures.`);
      const latest = sources.filter((s) => s.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))[0];
      if (latest) lines.push(`Most recent dated external item: “${latest.title}” (${latest.domain}, ${latest.publishedAt}).`);
    } else {
      lines.push("No external sources are attached to this report.");
    }
    return lines;
  }

  private methodology(queries: number, searches: number, cached: number, kept: number, ai: boolean): string[] {
    return [
      "RUWĀD figures are calculated directly from the RUWĀD platform database at the time of generation.",
      `External research used ${queries} focused web searches (${searches} new, ${cached} answered from a recent cache) run through RUWĀD's search integration.`,
      "Only sources from government bodies, official company and investor websites, international organizations, major consulting firms, and established news and industry publications are kept. Other pages are discarded.",
      `Results are de-duplicated by web address and title, checked for relevance to the topic, and ranked by source type, then date. ${kept} sources were kept.`,
      "External statements are shown exactly as retrieved (title, snippet, link, date). RUWĀD does not merge them with its own statistics or derive market sizes from them.",
      ai ? "A short overview was drafted by an AI assistant from the numbers and sources above and automatically checked so it contains no figure or citation that isn't in the data." : "No AI analysis was used: the overview lists calculated facts and retrieved sources only.",
      "The report is saved with its sources. Viewing it does not run new searches; an administrator can refresh the external research.",
    ];
  }

  private legacyFields(c: Composed, scope: ReportScope) {
    const domains = [...new Set(c.sources.map((s) => s.domain))];
    const strong = c.sources.filter((s) => s.tier <= 3).length;
    return {
      description: `RUWĀD platform data${c.sources.length ? ` with ${c.sources.length} external sources` : ""} for ${c.generated.scopeLabel}.`,
      geography: "Saudi Arabia", sector: scope.sector ?? "Healthcare", authors: [] as string[], badges: [] as ("Featured" | "New" | "Premium" | "Ruwād Research")[],
      readingTime: `${Math.max(2, Math.ceil((c.sources.length * 40 + c.stats.metrics.length * 15 + 300) / 200))} min read`, pages: 1,
      executiveSummary: c.aiOverview ?? c.generated.overviewLines.join(" "), keyFindings: [] as string[],
      marketStats: c.stats.metrics.map((m) => ({ label: m.label, value: m.value })), sections: [] as { heading: string; body: string }[],
      sources: c.sources.map((s) => `${s.title} — ${s.domain}`), provenanceConfidence: (strong >= 3 ? "Medium" : "Low") as "Medium" | "Low",
      provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: domains,
    };
  }

  private storedFields(c: Composed) {
    return { internalStats: c.stats, externalSources: c.sources, researchQueries: c.queries, researchedAt: new Date(), generationMode: c.mode, generated: c.generated, aiOverview: c.aiOverview };
  }
}
