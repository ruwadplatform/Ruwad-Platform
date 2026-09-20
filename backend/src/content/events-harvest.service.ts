import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Event } from "../events/event.entity";
import { SerperClient, type SerperOrganicItem } from "./serper.client";
import { EVENT_NEXT_YEAR_QUERIES, EVENT_QUERY_TEMPLATES } from "./content-config";
import {
  classifyEventType, classifyNews, cleanEventTitle, clip, isSameEvent, detectCity, detectCountry, eventStatus, extractSingleRange, hostOf, isAggregatorHost, isBlockedHost,
  addDays, isHealthcareRelevant, isPlausibleRange, looksLikeEvent, normalizeEventName, normalizeUrl, parseHttpUrl, type DateRange,
} from "./content-utils";
import { fetchHtml } from "./safe-fetch";
import { parseEventPage } from "./event-page.parser";
import { tally, type HarvestResult } from "./news-harvest.service";

const MAX_CANDIDATES = 40;
const ISO_COUNTRY: Record<string, string> = { SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", BH: "Bahrain", KW: "Kuwait", OM: "Oman", JO: "Jordan", EG: "Egypt", LB: "Lebanon" };

interface RawCandidate { item: SerperOrganicItem; urlKey: string; aggregator: boolean }
export interface EventCandidate {
  title: string; description: string; organizer: string; type: string; category: string;
  startDate: string; endDate: string; city: string | null; country: string; venue: string | null;
  sourceUrl: string; registrationUrl: string | null; imageUrl: string | null; urlKey: string; nameKey: string;
  dateSource: "structured" | "text"; isPublished: boolean; aggregator: boolean;
}

/** Finds upcoming MENA healthcare events. A date is only accepted when it is
 * reliable — schema.org data on the event's own page, or exactly one
 * unambiguous explicit-year date in its headline/snippet. No reliable date =
 * not saved, so an old event can never appear as an upcoming one. */
@Injectable()
export class EventsHarvestService {
  private readonly logger = new Logger(EventsHarvestService.name);

  constructor(
    private readonly serper: SerperClient,
    @InjectRepository(Event) private readonly repo: Repository<Event>,
  ) {}

  buildQueries(now = new Date()): { q: string; gl: string }[] {
    const year = now.getUTCFullYear();
    const out = EVENT_QUERY_TEMPLATES.map((t) => ({ q: t.q.replace("{Y}", String(year)), gl: t.gl }));
    for (const i of EVENT_NEXT_YEAR_QUERIES) out.push({ q: EVENT_QUERY_TEMPLATES[i].q.replace("{Y}", String(year + 1)), gl: EVENT_QUERY_TEMPLATES[i].gl });
    return out;
  }

  /** First-pass filter on a search result (no page fetch yet). */
  screen(item: SerperOrganicItem): RawCandidate | { reason: string } {
    if (!parseHttpUrl(item.link)) return { reason: "invalid-url" };
    if (isBlockedHost(item.link) || /\.pdf($|\?)/i.test(item.link)) return { reason: "blocked-source" };
    const urlKey = normalizeUrl(item.link);
    if (!urlKey) return { reason: "invalid-url" };
    const text = `${item.title} ${item.snippet ?? ""}`;
    if (!isHealthcareRelevant(item.title, item.snippet ?? "")) return { reason: "not-healthcare" };
    if (!looksLikeEvent(`${text} ${new URL(item.link).pathname}`)) return { reason: "not-an-event" };
    if (!detectCountry(text, item.link)) return { reason: "not-mena" };
    return { item, urlKey, aggregator: isAggregatorHost(item.link) };
  }

  /** Second pass: read the event's own page and settle the dates + details. */
  async build(raw: RawCandidate, now: Date): Promise<EventCandidate | { reason: string }> {
    const { item } = raw;
    const snippetText = `${item.title} ${item.snippet ?? ""}`;
    const snippetRange = extractSingleRange(snippetText, now);
    const page = await fetchHtml(item.link);
    const info = page ? parseEventPage(page.html, page.finalUrl) : null;

    let range: DateRange | null = null;
    let dateSource: "structured" | "text" = "text";
    const s = info?.structured;
    if (s?.startDate) {
      const r = { start: s.startDate, end: s.endDate ?? s.startDate };
      if (isPlausibleRange(r, now)) { range = r; dateSource = "structured"; }
    }
    if (!range) {
      const headline = info ? `${info.h1} ${info.ogTitle} ${info.title} ${info.ogDescription}` : "";
      const pageRange = headline ? extractSingleRange(headline, now) : null;
      if (pageRange && snippetRange && (pageRange.start !== snippetRange.start || pageRange.end !== snippetRange.end)) return { reason: "conflicting-dates" };
      range = pageRange ?? snippetRange;
    }
    if (!range) return { reason: "no-reliable-date" };
    if (raw.aggregator && dateSource !== "structured") return { reason: "aggregator-without-structured-data" };
    if (eventStatus(range.start, range.end, now) === "PAST") return { reason: "past" };

    const title = clip(cleanEventTitle((s?.name || info?.h1 || info?.ogTitle || item.title).replace(/\s+[|–—-]\s+[^|–—-]{2,50}$/, "")), 300);
    if (title.split(/\s+/).length < 2) return { reason: "generic-title" };
    const description = clip(s?.description || info?.ogDescription || item.snippet || "", 500);
    if (!isHealthcareRelevant(title, description)) return { reason: "not-healthcare" };

    const isoCountry = s?.country ? (ISO_COUNTRY[s.country.toUpperCase()] ?? detectCountry(s.country)) : null;
    const locationText = `${title} ${item.snippet ?? ""} ${info?.h1 ?? ""}`;
    const country = isoCountry ?? detectCountry(locationText, item.link);
    if (s?.country && !isoCountry) return { reason: "outside-region" }; // structured data says it's elsewhere
    if (!country) return { reason: "not-mena" };
    const city = s?.city ?? detectCity(locationText);

    const sourceUrl = parseHttpUrl(s?.url && parseHttpUrl(s.url) ? s.url : page?.finalUrl ?? item.link)!.toString().slice(0, 1000);
    const urlKey = normalizeUrl(sourceUrl) ?? raw.urlKey;
    const reg = parseHttpUrl(s?.registrationUrl) ?? parseHttpUrl(info?.registrationLink);
    const img = parseHttpUrl(s?.image ?? info?.ogImage);
    const nameKey = normalizeEventName(title);
    return {
      title, description, organizer: (s?.organizer ?? "").slice(0, 200), type: classifyEventType(`${title} ${item.snippet ?? ""}`),
      category: classifyNews(title, description), startDate: range.start, endDate: range.end,
      city: city ? city.slice(0, 100) : null, country, venue: s?.venue ? s.venue.slice(0, 200) : null,
      sourceUrl, registrationUrl: reg ? reg.toString().slice(0, 1000) : null, imageUrl: img && img.protocol === "https:" ? img.toString().slice(0, 1000) : null,
      urlKey, nameKey, dateSource, aggregator: raw.aggregator,
      // Publish only with the essentials: name, dates, a place and the source page.
      isPublished: title.length >= 8 && !!country && !!sourceUrl,
    };
  }

  async run(now = new Date()): Promise<HarvestResult> {
    const queries = this.buildQueries(now);
    const result: HarvestResult = { fetched: 0, saved: 0, updated: 0, skipped: 0, queries: queries.length, queriesFailed: 0, reasons: {} };
    const candidates = new Map<string, RawCandidate>();

    for (const q of queries) {
      let items: SerperOrganicItem[];
      try { items = await this.serper.search(q.q, q.gl); } catch (e) {
        result.queriesFailed++;
        this.logger.warn(`Event search failed for "${q.q}": ${e instanceof Error ? e.message : "unknown error"}`);
        continue;
      }
      result.fetched += items.length;
      for (const item of items) {
        const r = this.screen(item);
        if ("reason" in r) { tally(result, r.reason); continue; }
        const prev = candidates.get(r.urlKey);
        if (prev) { tally(result, "duplicate"); continue; }
        candidates.set(r.urlKey, r);
      }
    }
    if (result.queriesFailed === result.queries) throw new Error("All event searches failed");

    // Organizer pages first, listing sites last; then cap the number of page fetches.
    const ordered = [...candidates.values()].sort((a, b) => Number(a.aggregator) - Number(b.aggregator)).slice(0, MAX_CANDIDATES);
    for (let i = ordered.length; i < candidates.size; i++) tally(result, "over-candidate-cap");
    const built: EventCandidate[] = [];
    for (let i = 0; i < ordered.length; i += 4) {
      const batch = await Promise.all(ordered.slice(i, i + 4).map((c) => this.build(c, now).catch(() => ({ reason: "fetch-failed" }) as { reason: string })));
      for (const b of batch) { if ("reason" in b) tally(result, b.reason); else built.push(b); }
    }

    // Same event found through several pages: keep the organizer's page, not the listing.
    const unique: EventCandidate[] = [];
    for (const c of built.sort((a, b) => Number(a.aggregator) - Number(b.aggregator))) {
      const dup = unique.find((u) => u.urlKey === c.urlKey || isSameEvent(this.keyOf(u), this.keyOf(c)));
      if (dup) tally(result, "duplicate"); else unique.push(c);
    }
    for (const c of unique) {
      try { (await this.upsert(c, now)) === "saved" ? result.saved++ : result.updated++; } catch (e) {
        tally(result, "store-failed");
        this.logger.warn(`Couldn't store an event: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    return result;
  }

  private keyOf(c: EventCandidate) {
    return { startDate: c.startDate, endDate: c.endDate, nameKey: c.nameKey, city: c.city, country: c.country, host: hostOf(c.sourceUrl), aggregator: c.aggregator };
  }

  async upsert(c: EventCandidate, now: Date): Promise<"saved" | "updated"> {
    const existing = await this.findExisting(c);
    if (existing) {
      existing.lastSeenAt = now;
      // Manually curated rows keep their own content.
      if (existing.origin === "serper") {
        const existingIsListing = isAggregatorHost(existing.url);
        if ((existingIsListing && !c.aggregator) || c.dateSource === "structured") {
          const clash = c.urlKey !== existing.urlKey ? await this.repo.findOne({ where: { urlKey: c.urlKey } }) : null;
          if (!clash) { existing.url = c.sourceUrl; existing.urlKey = c.urlKey; }
        }
        if (c.dateSource === "structured" || existing.dateSource !== "structured") {
          existing.startDate = c.startDate; existing.endDate = c.endDate; existing.date = c.startDate; existing.dateSource = c.dateSource;
        }
        if (!existing.registrationUrl && c.registrationUrl) existing.registrationUrl = c.registrationUrl;
        if (!existing.imageUrl && c.imageUrl) existing.imageUrl = c.imageUrl;
        if (!existing.organizer && c.organizer) existing.organizer = c.organizer;
        if (!existing.venue && c.venue) existing.venue = c.venue;
        if (!existing.city && c.city) existing.city = c.city;
        if (!existing.description && c.description) existing.description = c.description;
      }
      await this.repo.save(existing);
      return "updated";
    }
    try {
      await this.repo.save(this.repo.create({
        name: c.title, date: c.startDate, startDate: c.startDate, endDate: c.endDate,
        location: [c.city, c.country].filter(Boolean).join(", "), country: c.country, city: c.city, venue: c.venue,
        type: c.type, sector: c.category, organizer: c.organizer, description: c.description, registrationStatus: "Open",
        url: c.sourceUrl, registrationUrl: c.registrationUrl, imageUrl: c.imageUrl, urlKey: c.urlKey, nameKey: c.nameKey,
        isPublished: c.isPublished, isFeatured: false, origin: "serper", dateSource: c.dateSource, lastSeenAt: now,
      }));
      return "saved";
    } catch (e: any) {
      if (e?.code === "23505") return "updated";
      throw e;
    }
  }

  private async findExisting(c: EventCandidate): Promise<Event | null> {
    const byUrl = await this.repo.findOne({ where: { urlKey: c.urlKey } });
    if (byUrl) return byUrl;
    const near = await this.repo.createQueryBuilder("e").where("e.startDate BETWEEN :a AND :b", { a: addDays(c.startDate, -1), b: addDays(c.startDate, 1) }).getMany();
    const mine = this.keyOf(c);
    return near.find((e) => e.nameKey && isSameEvent({ startDate: e.startDate ?? "", endDate: e.endDate ?? e.startDate ?? "", nameKey: e.nameKey, city: e.city ?? null, country: e.country ?? "", host: hostOf(e.url ?? ""), aggregator: isAggregatorHost(e.url ?? "") }, mine)) ?? null;
  }
}

/** Exposed for tests. */
export const eventsHarvestInternals = { hostOf };
