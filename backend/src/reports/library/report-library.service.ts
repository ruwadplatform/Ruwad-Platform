import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResearchService, type QueryLog, type ResearchResult, type ResearchSession } from "../../content/research.service";
import { Report } from "../report.entity";
import { buildSources, researchPlan, researchStatus, type PlanItem } from "../report-sources";
import { ReportStatsService } from "../report-stats.service";
import type { ExternalSource } from "../report-types";
import { LIBRARY_DEFINITIONS } from "./library-definitions";
import type { LibraryDefinition } from "./library-types";
import { LIBRARY_FACTS } from "./library-facts";
import { buildNarrative } from "./library-narrative";
import { assembleReport, emptyContent } from "./library-report";
import { LibraryStatsService } from "./library-stats.service";
import type { LibraryContent } from "./library-types";
import { verifyFacts, type DroppedFact } from "./library-verify";
import { fetchWorldBank } from "./library-world-bank";

const LIBRARY_QUERIES = 4;
/** Further reading older than this is left out; undated official pages are kept. */
const RECENT_SINCE = "2023-01-01";

/** A report is saved only when it is complete: enough sections, at least half of its planned sources verified, and no paragraph dropped
 * for carrying an unsupported number. Anything less is reported as "skipped" and never saved or published. */
export const MIN_SECTIONS = 4;
export function incompleteReasons(o: { sections: number; factsUsed: number; factsPlanned: number; warnings: number }): string[] {
  const reasons: string[] = [];
  if (o.sections < MIN_SECTIONS) reasons.push(`only ${o.sections} sections could be built (at least ${MIN_SECTIONS} are needed)`);
  if (o.factsUsed < Math.ceil(o.factsPlanned * 0.5)) reasons.push(`only ${o.factsUsed} of ${o.factsPlanned} planned sources could be verified`);
  if (o.warnings > 0) reasons.push("a paragraph failed the number check");
  return reasons;
}

export interface LibraryReportResult {
  slug: string; title: string; action: "created" | "updated" | "preview" | "skipped" | "failed"; isPublished: boolean; reasons: string[];
  sections: number; factsUsed: number; factsReverified: number; factsManual: number; worldBankPoints: number; furtherReading: number;
  missing: string[]; warnings: string[];
}
export interface LibraryRunResult { reports: LibraryReportResult[]; dropped: DroppedFact[]; worldBankFailed: string[]; research: { status: string; searches: number; cached: number } }

/** Builds the default RUWĀD report library through the normal report tables: statistics from the RUWĀD database, sourced external
 * facts (re-verified against their pages), live World Bank indicators, and further reading found with the shared Serper client. */
@Injectable()
export class ReportLibraryService {
  private readonly logger = new Logger(ReportLibraryService.name);
  private running = false;

  constructor(
    @InjectRepository(Report) private readonly repo: Repository<Report>,
    private readonly libraryStats: LibraryStatsService,
    private readonly reportStats: ReportStatsService,
    private readonly research: ResearchService,
  ) {}

  /** What the library should contain and what is currently saved. */
  async status() {
    const rows = await this.repo.find({ where: LIBRARY_DEFINITIONS.map((d) => ({ slug: d.slug })), select: ["slug", "isPublished", "updatedAt", "origin"] });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    return LIBRARY_DEFINITIONS.map((d) => ({ slug: d.slug, title: d.title, category: d.category, exists: bySlug.has(d.slug), isPublished: bySlug.get(d.slug)?.isPublished ?? false, updatedAt: bySlug.get(d.slug)?.updatedAt ?? null }));
  }

  /** Runs each report's few searches through the shared session (cache first, Serper only for what is not cached). */
  private async runResearch(session: ResearchSession, defs: LibraryDefinition[]) {
    const out = new Map<string, { plan: PlanItem[]; results: ResearchResult[]; log: QueryLog[] }>();
    for (const def of defs) {
      const plan = researchPlan("SECTOR_OVERVIEW", { sector: def.researchTopic }).slice(0, LIBRARY_QUERIES);
      const start = session.log.length;
      const results = await Promise.all(plan.map((p) => session.run(p.query, { kind: p.kind, topic: p.topic, tbs: p.tbs, num: 10 })));
      out.set(def.slug, { plan, results, log: session.log.slice(start) });
    }
    return out;
  }

  async generate(opts: { slugs?: string[]; publish?: boolean; dryRun?: boolean; skipResearch?: boolean } = {}): Promise<LibraryRunResult> {
    if (this.running) throw new ConflictException("The report library is already being generated. Please wait a moment.");
    this.running = true;
    try {
      const defs = LIBRARY_DEFINITIONS.filter((d) => !opts.slugs?.length || opts.slugs.includes(d.slug));
      const neededFacts = LIBRARY_FACTS.filter((f) => defs.some((d) => d.factIds.includes(f.id)));
      const wbIds = [...new Set(defs.flatMap((d) => d.worldBankIds))];
      const session = this.research.session(defs.length * LIBRARY_QUERIES, { ttlHours: 24 });
      const started = Date.now();
      const lap = (what: string) => this.logger.log(`library: ${what} (${((Date.now() - started) / 1000).toFixed(1)}s)`);

      // Source checks, World Bank, and the shared web research are independent, so they run at the same time.
      const useResearch = !opts.skipResearch && this.research.enabled;
      const [{ facts, dropped }, wb, officialHosts, found] = await Promise.all([
        verifyFacts(neededFacts).then((r) => { lap("sources verified"); return r; }),
        fetchWorldBank(wbIds).then((r) => { lap("World Bank retrieved"); return r; }),
        this.reportStats.officialHosts(),
        useResearch ? this.runResearch(session, defs).then((r) => { lap("web research done"); return r; }) : Promise.resolve(null),
      ]);
      const results: LibraryReportResult[] = [];

      for (const def of defs) {
        try {
        const defFacts = facts.filter((f) => def.factIds.includes(f.id));
        const defWb = wb.points.filter((p) => def.worldBankIds.includes(p.id));
        const { stats, raw } = await this.libraryStats.build(def.categories);
        const narrative = buildNarrative({ def, raw, facts: defFacts, worldBank: defWb });
        narrative.warnings.forEach((w) => this.logger.warn(`${def.slug}: ${w}`));

        let furtherReading: ExternalSource[] = [];
        const research = found?.get(def.slug);
        if (research) {
          const now = new Date();
          const hits = research.results.flatMap((r, i) => r.items.map((item) => ({ item, plan: research.plan[i] })));
          const quoted = new Set(defFacts.map((f) => f.url));
          furtherReading = buildSources(hits, { officialHosts, scope: { sector: def.researchTopic }, now }, now.toISOString(), 8).filter((s) => !quoted.has(s.url) && s.tier <= 3 && (!s.publishedAt || s.publishedAt >= RECENT_SINCE));
        }
        const queries = research?.log ?? [];

        const content: LibraryContent = { ...emptyContent(furtherReading), facts: defFacts, worldBank: defWb, sections: narrative.sections, missing: [...new Set(narrative.missing)] };
        const today = new Date().toISOString().slice(0, 10);
        const fields = assembleReport(def, content, stats, queries, today);

        const existing = await this.repo.findOne({ where: { slug: def.slug } });
        const reasons = incompleteReasons({ sections: content.sections.length, factsUsed: defFacts.length, factsPlanned: def.factIds.length, warnings: narrative.warnings.length });
        let action: LibraryReportResult["action"] = reasons.length ? "skipped" : "preview";
        let isPublished = existing?.isPublished ?? false;
        if (!opts.dryRun && !reasons.length) {
          // publish:true makes the report public; otherwise a new report is published and an existing one keeps its visibility.
          isPublished = opts.publish === true ? true : existing ? existing.isPublished : opts.publish !== false;
          const saved = await this.repo.save(existing
            ? Object.assign(existing, fields, { isPublished, publishedAt: existing.publishedAt ?? new Date() })
            : this.repo.create({ ...fields, isPublished, publishedAt: isPublished ? new Date() : undefined }));
          action = existing ? "updated" : "created";
          isPublished = saved.isPublished;
        }
        lap(`${def.slug}: ${action}`);
        results.push({
          slug: def.slug, title: def.title, action, isPublished, reasons, sections: content.sections.length, factsUsed: defFacts.length,
          factsReverified: defFacts.filter((f) => f.verification === "live").length, factsManual: defFacts.filter((f) => f.verification === "manual").length,
          worldBankPoints: defWb.length, furtherReading: furtherReading.length, missing: content.missing, warnings: narrative.warnings,
        });
        } catch (e) {
          this.logger.error(`${def.slug}: generation failed — ${e instanceof Error ? e.message : String(e)}`);
          results.push({ slug: def.slug, title: def.title, action: "failed", isPublished: false, reasons: ["this report could not be generated; nothing was saved or published"], sections: 0, factsUsed: 0, factsReverified: 0, factsManual: 0, worldBankPoints: 0, furtherReading: 0, missing: [], warnings: [] });
        }
      }
      return {
        reports: results, dropped, worldBankFailed: wb.failed,
        research: { status: researchStatus(session.log, this.research.enabled || session.cacheHits > 0), searches: session.serperCalls, cached: session.cacheHits },
      };
    } finally {
      this.running = false;
    }
  }
}
