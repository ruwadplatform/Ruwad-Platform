import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ContentSyncRun } from "./content-sync-run.entity";
import { NewsHarvestService, type HarvestResult } from "./news-harvest.service";
import { EventsHarvestService } from "./events-harvest.service";
import { SerperClient } from "./serper.client";

export type ContentKind = "news" | "events";
export const NEWS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const EVENTS_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const INTERVALS: Record<ContentKind, number> = { news: NEWS_REFRESH_INTERVAL_MS, events: EVENTS_REFRESH_INTERVAL_MS };
const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 90 * 1000;
const STALE_RUNNING_MS = 20 * 60 * 1000;

export interface RunSummary { kind: ContentKind; status: "ok" | "partial" | "failed" | "skipped"; result?: HarvestResult; message?: string }

/** Runs and schedules the collection jobs.
 *
 * Three ways to trigger it, all backend-only:
 *  1. an in-process check every 30 min that runs news every 6h / events every
 *     12h, judged from the last successful run stored in the database — so a
 *     host that sleeps (Render free tier) simply catches up when it wakes;
 *  2. POST /api/content-refresh/:kind with the shared secret, for an external
 *     scheduler or Render Cron Job;
 *  3. `npm run content:refresh`, which runs once and exits. */
@Injectable()
export class ContentRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentRefreshService.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<ContentKind>();

  constructor(
    private readonly config: ConfigService,
    private readonly serper: SerperClient,
    private readonly news: NewsHarvestService,
    private readonly events: EventsHarvestService,
    @InjectRepository(ContentSyncRun) private readonly runs: Repository<ContentSyncRun>,
  ) {}

  onModuleInit(): void {
    if (!this.serper.enabled || this.config.get<string>("CONTENT_REFRESH_INTERNAL") === "false") return;
    const first = setTimeout(() => void this.catchUp(), FIRST_CHECK_DELAY_MS);
    const every = setInterval(() => void this.catchUp(), CHECK_EVERY_MS);
    first.unref(); every.unref();
    this.timers.push(first, every);
    this.logger.log("Automatic news/events refresh enabled (news every 6h, events every 12h).");
  }

  onModuleDestroy(): void { this.timers.forEach((t) => clearTimeout(t)); this.timers = []; }

  /** Runs any kind that is older than its interval. */
  async catchUp(): Promise<void> {
    for (const kind of ["news", "events"] as ContentKind[]) {
      try {
        const last = await this.lastSuccess(kind);
        if (!last || Date.now() - (last.finishedAt ?? last.startedAt).getTime() >= INTERVALS[kind]) await this.runOne(kind);
      } catch (e) {
        this.logger.warn(`Scheduled ${kind} refresh check failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
  }

  async refresh(kind: ContentKind | "all"): Promise<RunSummary[]> {
    const kinds: ContentKind[] = kind === "all" ? ["news", "events"] : [kind];
    const out: RunSummary[] = [];
    for (const k of kinds) out.push(await this.runOne(k));
    return out;
  }

  async status(): Promise<Record<string, unknown>> {
    const last = async (kind: ContentKind) => {
      const r = await this.runs.findOne({ where: { kind }, order: { startedAt: "DESC" } });
      return r ? { status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, fetched: r.fetched, saved: r.saved, updated: r.updated, skipped: r.skipped, message: r.message } : null;
    };
    return { configured: this.serper.enabled, news: await last("news"), events: await last("events") };
  }

  private lastSuccess(kind: ContentKind): Promise<ContentSyncRun | null> {
    return this.runs.createQueryBuilder("r").where("r.kind = :kind AND r.status IN ('ok','partial')", { kind }).orderBy("r.startedAt", "DESC").getOne();
  }

  async runOne(kind: ContentKind): Promise<RunSummary> {
    if (!this.serper.enabled) return { kind, status: "skipped", message: "Automatic collection isn't configured." };
    if (this.running.has(kind)) return { kind, status: "skipped", message: "A refresh is already running." };
    // Another instance may be mid-run (e.g. during a deploy overlap).
    const active = await this.runs.createQueryBuilder("r").where("r.kind = :kind AND r.status = 'running' AND r.startedAt > :since", { kind, since: new Date(Date.now() - STALE_RUNNING_MS) }).getOne();
    if (active) return { kind, status: "skipped", message: "A refresh is already running." };

    this.running.add(kind);
    const run = await this.runs.save(this.runs.create({ kind, status: "running", startedAt: new Date(), fetched: 0, saved: 0, updated: 0, skipped: 0 }));
    try {
      const result = kind === "news" ? await this.news.run() : await this.events.run();
      const status = result.queriesFailed > 0 ? "partial" : "ok";
      Object.assign(run, { status, finishedAt: new Date(), fetched: result.fetched, saved: result.saved, updated: result.updated, skipped: result.skipped, message: result.queriesFailed ? `${result.queriesFailed} of ${result.queries} searches failed` : null });
      await this.runs.save(run);
      this.logger.log(`${kind} refresh ${status}: fetched ${result.fetched}, saved ${result.saved}, updated ${result.updated}, skipped ${result.skipped}`);
      return { kind, status, result };
    } catch (e) {
      // Stored content is untouched; users keep seeing what was collected earlier.
      const message = e instanceof Error ? e.message.slice(0, 200) : "Refresh failed";
      Object.assign(run, { status: "failed", finishedAt: new Date(), message });
      await this.runs.save(run).catch(() => undefined);
      this.logger.error(`${kind} refresh failed: ${message}`);
      return { kind, status: "failed", message };
    } finally {
      this.running.delete(kind);
    }
  }
}
