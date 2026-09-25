import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResearchService } from "../../content/research.service";
import { Report } from "../report.entity";
import { buildSources, researchPlan, researchStatus } from "../report-sources";
import { ReportStatsService } from "../report-stats.service";
import type { ExternalSource } from "../report-types";
import { LIBRARY_DEFINITIONS } from "./library-definitions";
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

export interface LibraryReportResult {
  slug: string; title: string; action: "created" | "updated" | "preview"; isPublished: boolean;
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

  async generate(opts: { slugs?: string[]; publish?: boolean; dryRun?: boolean; skipResearch?: boolean } = {}): Promise<LibraryRunResult> {
    if (this.running) throw new ConflictException("The report library is already being generated. Please wait a moment.");
    this.running = true;
    try {
      const defs = LIBRARY_DEFINITIONS.filter((d) => !opts.slugs?.length || opts.slugs.includes(d.slug));
      const neededFacts = LIBRARY_FACTS.filter((f) => defs.some((d) => d.factIds.includes(f.id)));
      const { facts, dropped } = await verifyFacts(neededFacts);
      const wbIds = [...new Set(defs.flatMap((d) => d.worldBankIds))];
      const wb = await fetchWorldBank(wbIds);

      const session = this.research.session(defs.length * LIBRARY_QUERIES, { ttlHours: 24 });
      const officialHosts = await this.reportStats.officialHosts();
      const results: LibraryReportResult[] = [];

      for (const def of defs) {
        const defFacts = facts.filter((f) => def.factIds.includes(f.id));
        const defWb = wb.points.filter((p) => def.worldBankIds.includes(p.id));
        const { stats, raw } = await this.libraryStats.build(def.categories);
        const narrative = buildNarrative({ def, raw, facts: defFacts, worldBank: defWb });
        narrative.warnings.forEach((w) => this.logger.warn(`${def.slug}: ${w}`));

        let furtherReading: ExternalSource[] = [];
        const queryStart = session.log.length;
        if (!opts.skipResearch && this.research.enabled) {
          const plan = researchPlan("SECTOR_OVERVIEW", { sector: def.researchTopic }).slice(0, LIBRARY_QUERIES);
          const found = await Promise.all(plan.map((p) => session.run(p.query, { kind: p.kind, topic: p.topic, tbs: p.tbs, num: 10 })));
          const now = new Date();
          const hits = found.flatMap((r, i) => r.items.map((item) => ({ item, plan: plan[i] })));
          const quoted = new Set(defFacts.map((f) => f.url));
          furtherReading = buildSources(hits, { officialHosts, scope: { sector: def.researchTopic }, now }, now.toISOString(), 8).filter((s) => !quoted.has(s.url) && s.tier <= 3 && (!s.publishedAt || s.publishedAt >= RECENT_SINCE));
        }
        const queries = session.log.slice(queryStart);

        const content: LibraryContent = { ...emptyContent(furtherReading), facts: defFacts, worldBank: defWb, sections: narrative.sections, missing: [...new Set(narrative.missing)] };
        const today = new Date().toISOString().slice(0, 10);
        const fields = assembleReport(def, content, stats, queries, today);

        const existing = await this.repo.findOne({ where: { slug: def.slug } });
        let action: LibraryReportResult["action"] = "preview";
        let isPublished = existing?.isPublished ?? false;
        if (!opts.dryRun) {
          // A library report an admin has unpublished stays unpublished when it is regenerated.
          isPublished = existing ? existing.isPublished : opts.publish !== false;
          const saved = await this.repo.save(existing
            ? Object.assign(existing, fields, { isPublished, publishedAt: existing.publishedAt ?? new Date() })
            : this.repo.create({ ...fields, isPublished, publishedAt: isPublished ? new Date() : undefined }));
          action = existing ? "updated" : "created";
          isPublished = saved.isPublished;
        }
        results.push({
          slug: def.slug, title: def.title, action, isPublished, sections: content.sections.length, factsUsed: defFacts.length,
          factsReverified: defFacts.filter((f) => f.verification === "live").length, factsManual: defFacts.filter((f) => f.verification === "manual").length,
          worldBankPoints: defWb.length, furtherReading: furtherReading.length, missing: content.missing, warnings: narrative.warnings,
        });
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
