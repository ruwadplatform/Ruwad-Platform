import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { Repository } from "typeorm";
import { ResearchCache } from "./research-cache.entity";
import { SerperClient, type SerperKnowledgeGraph } from "./serper.client";

/** One search hit, in a shape that doesn't depend on which Serper endpoint produced it. */
export interface ResearchItem { title: string; url: string; snippet: string; date: string | null; source: string | null; position: number }
export interface ResearchResult { items: ResearchItem[]; knowledgeGraph: SerperKnowledgeGraph | null; cached: boolean; failed: boolean; skipped: boolean }
export interface QueryLog { query: string; kind: "search" | "news"; topic: string; results: number; cached: boolean; failed: boolean; skipped: boolean }
export interface RunOptions { kind?: "search" | "news"; gl?: string; num?: number; tbs?: string; topic?: string }

const DEFAULT_TTL_HOURS = 24;
const norm = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

/** A budgeted set of searches for ONE piece of work (one report, one pitch deck). It:
 *  - never runs the same normalized query twice,
 *  - stops at `maxQueries` distinct queries,
 *  - answers from the shared cache when it can (no Serper credit spent),
 *  - never throws: a failed search is just an empty, flagged result. */
export class ResearchSession {
  readonly log: QueryLog[] = [];
  serperCalls = 0;
  cacheHits = 0;
  private readonly seen = new Map<string, ResearchResult>();

  constructor(private readonly service: ResearchService, readonly maxQueries: number, private readonly force: boolean, private readonly ttlHours: number) {}

  async run(query: string, opts: RunOptions = {}): Promise<ResearchResult> {
    const kind = opts.kind ?? "search";
    const key = this.service.cacheKey(kind, query, opts);
    const already = this.seen.get(key);
    if (already) return already; // duplicate query in the same run: free
    const empty: ResearchResult = { items: [], knowledgeGraph: null, cached: false, failed: false, skipped: false };
    let result: ResearchResult;
    if (this.seen.size >= this.maxQueries) result = { ...empty, skipped: true };
    else {
      result = await this.service.fetchOne(key, kind, query, opts, this.force, this.ttlHours);
      if (result.cached) this.cacheHits++; else if (!result.failed) this.serperCalls++;
    }
    this.seen.set(key, result);
    this.log.push({ query, kind, topic: opts.topic ?? "general", results: result.items.length, cached: result.cached, failed: result.failed, skipped: result.skipped });
    return result;
  }
}

/** Shared research layer on top of the ONE existing Serper client (same SERPER_API_KEY as News & Events). */
@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);
  constructor(private readonly serper: SerperClient, @InjectRepository(ResearchCache) private readonly cache: Repository<ResearchCache>) {}

  get enabled(): boolean { return this.serper.enabled; }

  session(maxQueries: number, opts: { force?: boolean; ttlHours?: number } = {}): ResearchSession {
    return new ResearchSession(this, maxQueries, !!opts.force, opts.ttlHours ?? DEFAULT_TTL_HOURS);
  }

  cacheKey(kind: string, query: string, o: RunOptions): string {
    return createHash("sha256").update([kind, o.gl ?? "sa", o.tbs ?? "", o.num ?? 10, norm(query)].join("|")).digest("hex");
  }

  /** Cache first (unless forced), then one Serper request. Errors are logged without provider output. */
  async fetchOne(key: string, kind: "search" | "news", query: string, o: RunOptions, force: boolean, ttlHours: number): Promise<ResearchResult> {
    const base = { items: [] as ResearchItem[], knowledgeGraph: null as SerperKnowledgeGraph | null, cached: false, failed: false, skipped: false };
    try {
      if (!force) {
        const hit = await this.cache.findOne({ where: { key } });
        if (hit && Date.now() - hit.fetchedAt.getTime() < ttlHours * 3600_000) {
          const p = hit.payload as { items: ResearchItem[]; knowledgeGraph: SerperKnowledgeGraph | null };
          return { ...base, items: p.items ?? [], knowledgeGraph: p.knowledgeGraph ?? null, cached: true };
        }
      }
      if (!this.serper.enabled) return { ...base, failed: true };
      const gl = o.gl ?? "sa";
      let items: ResearchItem[]; let knowledgeGraph: SerperKnowledgeGraph | null = null;
      if (kind === "news") {
        const raw = await this.serper.news(query, gl, { num: o.num ?? 10, tbs: o.tbs ?? "qdr:m" });
        items = raw.map((r, i) => ({ title: r.title, url: r.link, snippet: r.snippet ?? "", date: r.date ?? null, source: r.source ?? null, position: i + 1 }));
      } else {
        const raw = await this.serper.searchDetailed(query, gl, { num: o.num ?? 10, tbs: o.tbs });
        items = raw.organic.map((r, i) => ({ title: r.title, url: r.link, snippet: r.snippet ?? "", date: r.date ?? null, source: null, position: r.position ?? i + 1 }));
        knowledgeGraph = raw.knowledgeGraph;
      }
      await this.cache.upsert({ key, kind, query: query.slice(0, 500), payload: { items, knowledgeGraph } as never, fetchedAt: new Date() }, ["key"]);
      return { ...base, items, knowledgeGraph };
    } catch (e) {
      this.logger.warn(`Research query failed (${e instanceof Error ? e.message : "unknown error"})`);
      return { ...base, failed: true };
    }
  }
}
