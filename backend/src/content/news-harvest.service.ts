import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NewsArticle } from "../news/news-article.entity";
import { SerperClient, type SerperNewsItem } from "./serper.client";
import { NEWS_QUERIES } from "./content-config";
import {
  addDays, classifyNews, clip, detectCountry, hostOf, isBlockedHost, isHealthcareRelevant, normalizeTitle, normalizeUrl,
  parseHttpUrl, parsePublishedDate, todayIso,
} from "./content-utils";

export interface HarvestResult {
  fetched: number; saved: number; updated: number; skipped: number; queries: number; queriesFailed: number; message?: string;
  /** Why items were skipped: reason -> count ("duplicate" = the same item seen again in this run). */
  reasons: Record<string, number>;
}

export function tally(result: HarvestResult, reason: string): void {
  result.skipped++;
  result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
}

const MAX_AGE_DAYS = 14;
const SUMMARY_MAX = 300;

interface Candidate {
  title: string; sourceName: string; sourceUrl: string; urlKey: string; titleKey: string;
  publishedDate: string; geography: string; category: string; summary: string; imageUrl: string | null;
}

/** Collects recent MENA healthcare news through Serper and stores only what
 * passes the relevance, freshness and date-reliability rules. Never invents a
 * field: an article without a reliable date or region is simply not kept. */
@Injectable()
export class NewsHarvestService {
  private readonly logger = new Logger(NewsHarvestService.name);

  constructor(
    private readonly serper: SerperClient,
    @InjectRepository(NewsArticle) private readonly repo: Repository<NewsArticle>,
  ) {}

  /** Turns a raw result into a storable article, or null with the reason it
   * was rejected (used for the skipped counter and by the tests). */
  evaluate(item: SerperNewsItem, now = new Date()): { candidate: Candidate } | { reason: string } {
    const url = parseHttpUrl(item.link);
    if (!url) return { reason: "invalid-url" };
    if (isBlockedHost(item.link)) return { reason: "blocked-source" };
    const urlKey = normalizeUrl(item.link);
    if (!urlKey) return { reason: "invalid-url" };
    const title = (item.title ?? "").replace(/\s+/g, " ").trim();
    if (title.length < 15) return { reason: "no-title" };

    const publishedDate = parsePublishedDate(item.date, now);
    if (!publishedDate) return { reason: "no-reliable-date" };
    const today = todayIso(now);
    if (publishedDate < addDays(today, -MAX_AGE_DAYS)) return { reason: "too-old" };
    if (publishedDate > addDays(today, 1)) return { reason: "future-date" };

    const snippet = (item.snippet ?? "").trim();
    if (!isHealthcareRelevant(title, snippet)) return { reason: "not-healthcare" };
    const sourceName = (item.source ?? "").trim() || hostOf(item.link);
    const geography = detectCountry(`${title} ${snippet} ${sourceName}`, item.link);
    if (!geography) return { reason: "not-mena" };

    const img = parseHttpUrl(item.imageUrl);
    return {
      candidate: {
        title: title.slice(0, 300), sourceName: sourceName.slice(0, 120), sourceUrl: url.toString().slice(0, 1000), urlKey,
        titleKey: normalizeTitle(title), publishedDate, geography, category: classifyNews(title, snippet),
        summary: clip(snippet, SUMMARY_MAX), imageUrl: img && img.protocol === "https:" ? img.toString().slice(0, 1000) : null,
      },
    };
  }

  async run(now = new Date()): Promise<HarvestResult> {
    const result: HarvestResult = { fetched: 0, saved: 0, updated: 0, skipped: 0, queries: NEWS_QUERIES.length, queriesFailed: 0, reasons: {} };
    const seen = new Map<string, Candidate>();

    for (const q of NEWS_QUERIES) {
      let items: SerperNewsItem[];
      try {
        items = await this.serper.news(q.q, q.gl, { tbs: "qdr:w" });
      } catch (e) {
        result.queriesFailed++;
        this.logger.warn(`News search failed for "${q.q}": ${e instanceof Error ? e.message : "unknown error"}`);
        continue;
      }
      result.fetched += items.length;
      for (const item of items) {
        const ev = this.evaluate(item, now);
        if ("reason" in ev) { tally(result, ev.reason); continue; }
        if (seen.has(ev.candidate.urlKey)) { tally(result, "duplicate"); continue; } // same story returned by several queries
        seen.set(ev.candidate.urlKey, ev.candidate);
      }
    }
    if (result.queriesFailed === result.queries) throw new Error("All news searches failed");

    for (const c of seen.values()) {
      try {
        (await this.upsert(c, now)) === "saved" ? result.saved++ : result.updated++;
      } catch (e) {
        tally(result, "store-failed");
        this.logger.warn(`Couldn't store a news article: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    return result;
  }

  /** New article, or a refresh of the one we already have. Curation flags
   * (isPublished / isFeatured) and manually created rows are never overwritten. */
  async upsert(c: Candidate, now: Date): Promise<"saved" | "updated"> {
    const existing = await this.findExisting(c);
    if (existing) {
      existing.lastSeenAt = now;
      if (existing.origin === "serper") {
        if (!existing.imageUrl && c.imageUrl) existing.imageUrl = c.imageUrl;
        if (!existing.summary && c.summary) existing.summary = c.summary;
      }
      await this.repo.save(existing);
      return "updated";
    }
    try {
      await this.repo.save(this.repo.create({
        title: c.title, source: c.sourceName, publishedDate: c.publishedDate, category: c.category, sector: c.category, geography: c.geography,
        summary: c.summary, sourceUrl: c.sourceUrl, imageUrl: c.imageUrl, urlKey: c.urlKey, titleKey: c.titleKey,
        isPublished: true, isFeatured: false, origin: "serper", lastSeenAt: now,
      }));
      return "saved";
    } catch (e: any) {
      // A concurrent run inserted the same URL between our check and insert.
      if (e?.code === "23505") return "updated";
      throw e;
    }
  }

  private async findExisting(c: Candidate): Promise<NewsArticle | null> {
    const byUrl = await this.repo.findOne({ where: { urlKey: c.urlKey } });
    if (byUrl) return byUrl;
    // Same headline from the same publisher within a few days = the same story at a different URL.
    return this.repo.createQueryBuilder("n")
      .where("n.titleKey = :k AND n.source = :s", { k: c.titleKey, s: c.sourceName })
      .andWhere("n.publishedDate BETWEEN :from AND :to", { from: addDays(c.publishedDate, -3), to: addDays(c.publishedDate, 3) })
      .getOne();
  }
}
