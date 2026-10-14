import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AiSummary } from "./ai-summary.entity";
import { Startup } from "../startups/startup.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { HubProgram } from "../hubs/hub-program.entity";
import { Multinational } from "../multinationals/multinational.entity";
import { DirectorySharedService } from "../directory-shared/directory-shared.service";
import { ResearchService } from "../content/research.service";
import { buildWebQuery, citedSources, selectWebSources } from "./ai-summary-web";
import { AiSummaryGenerator, PROMPT_VERSION, ProviderFailureError, ProviderNotConfiguredError, type GeneratedSummary } from "./ai-summary-generator";
import {
  ENTITY_KIND_BY_TYPE, buildHubContext, buildInvestorContext, buildMultinationalContext, buildStartupContext, hasEnoughData, isSummaryEntityType,
  sourceFingerprint, type SummaryContext, type SummaryEntityType,
} from "./ai-summary-context";

/** Everyone who can call this endpoint is signed in, so there is a single audience today. A new tier would get its own scope (and its own cache rows). */
export const ACCESS_SCOPE = "member";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export type AiSummaryResponse =
  | {
      status: "ready";
      entityType: SummaryEntityType;
      name: string;
      overview: string;
      highlights: string[];
      /** Public web results the text cites, as [W1]… markers in the overview/highlights. */
      webSources: { id: string; title: string; url: string; site: string }[];
      aiGenerated: true;
      cached: boolean;
      generatedAt: string;
      modelVersion: string;
      source: { label: string; sources: string[]; confidence: string | null; lastUpdated: string | null };
    }
  | { status: "unavailable"; entityType: SummaryEntityType; name: string; reason: "insufficient_data" | "provider_not_configured" };

type Loaded = { id: string; name: string; ctx: SummaryContext };

@Injectable()
export class AiSummariesService {
  private readonly logger = new Logger(AiSummariesService.name);
  /** Concurrent requests for the same entity+data share one provider call. */
  private readonly inFlight = new Map<string, Promise<{ summary: GeneratedSummary; web: { id: string; title: string; url: string; site: string }[] }>>();
  private readonly webEnabled: boolean;
  private readonly generationTimes: number[] = [];
  private readonly ttlMs: number;
  private readonly maxPerHour: number;

  constructor(
    @InjectRepository(AiSummary) private readonly cache: Repository<AiSummary>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(HubProgram) private readonly hubPrograms: Repository<HubProgram>,
    @InjectRepository(Multinational) private readonly multinationals: Repository<Multinational>,
    private readonly shared: DirectorySharedService,
    private readonly generator: AiSummaryGenerator,
    private readonly research: ResearchService,
    config: ConfigService,
  ) {
    this.webEnabled = (config.get<string>("AI_SUMMARY_WEB_SEARCH") ?? "true").toLowerCase() !== "false";
    this.ttlMs = (Number(config.get<string>("AI_SUMMARY_TTL_DAYS")) || 30) * 24 * 3600 * 1000;
    this.maxPerHour = Number(config.get<string>("AI_SUMMARY_MAX_GENERATIONS_PER_HOUR")) || 200;
  }

  async get(typeParam: string, idParam: string, opts: { admin?: boolean } = {}): Promise<AiSummaryResponse> {
    if (!isSummaryEntityType(typeParam)) throw new BadRequestException("Unsupported entity type.");
    if (!SAFE_ID.test(idParam)) throw new BadRequestException("Invalid identifier.");
    const type = typeParam;
    const kind = ENTITY_KIND_BY_TYPE[type];

    const loaded = await this.load(type, idParam);
    if (!loaded) throw new NotFoundException("Organization not found.");
    const { ctx } = loaded;

    if (!hasEnoughData(ctx)) return { status: "unavailable", entityType: type, name: loaded.name, reason: "insufficient_data" };

    const fingerprint = sourceFingerprint(ctx.facts, PROMPT_VERSION);
    const now = new Date();
    const row = await this.cache.findOne({ where: { entityType: kind, entityId: loaded.id, accessScope: ACCESS_SCOPE } });
    if (row && row.sourceFingerprint === fingerprint && row.expiresAt > now) return this.ready(type, loaded, row, true);

    if (!this.generator.available) return { status: "unavailable", entityType: type, name: loaded.name, reason: "provider_not_configured" };

    const key = `${kind}:${loaded.id}:${ACCESS_SCOPE}:${fingerprint}`;
    let pending = this.inFlight.get(key);
    if (!pending) {
      this.assertUnderHourlyCap();
      pending = this.generateWithWeb(type, loaded).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }

    let generated: { summary: GeneratedSummary; web: { id: string; title: string; url: string; site: string }[] };
    try {
      generated = await pending;
    } catch (e) {
      if (e instanceof ProviderNotConfiguredError) return { status: "unavailable", entityType: type, name: loaded.name, reason: "provider_not_configured" };
      if (e instanceof ProviderFailureError) {
        const message = "The AI summary could not be generated right now. Please try again.";
        // Admins also get the secret-free reason, so a misconfigured key/model is diagnosable without reading server logs.
        throw new ServiceUnavailableException(opts.admin ? { statusCode: 503, error: "Service Unavailable", message, detail: e.detail } : message);
      }
      this.logger.error(`AI summary failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException("The AI summary could not be generated right now. Please try again.");
    }

    const generatedAt = new Date();
    await this.cache.upsert(
      {
        entityType: kind, entityId: loaded.id, accessScope: ACCESS_SCOPE, overview: generated.summary.overview, highlights: generated.summary.highlights, webSources: generated.web,
        modelVersion: this.generator.model, promptVersion: PROMPT_VERSION, sourceFingerprint: fingerprint, generatedAt,
        expiresAt: new Date(generatedAt.getTime() + this.ttlMs), status: "READY",
      },
      { conflictPaths: ["entityType", "entityId", "accessScope"] },
    );
    const fresh = await this.cache.findOne({ where: { entityType: kind, entityId: loaded.id, accessScope: ACCESS_SCOPE } });
    return this.ready(type, loaded, fresh!, false);
  }

  private ready(type: SummaryEntityType, loaded: Loaded, row: AiSummary, cached: boolean): AiSummaryResponse {
    return {
      status: "ready", entityType: type, name: loaded.name, overview: row.overview, highlights: row.highlights, webSources: row.webSources ?? [], aiGenerated: true, cached,
      generatedAt: row.generatedAt.toISOString(), modelVersion: row.modelVersion,
      source: { label: "RUWĀD profile data", sources: loaded.ctx.provenance.sources, confidence: loaded.ctx.provenance.confidence, lastUpdated: loaded.ctx.provenance.lastUpdated },
    };
  }

  /** Optional enrichment: a few public web results about this organization (one cached Serper search). A failed or empty search just means
   * the summary is written from the profile alone; it never blocks or fails the request. */
  private async generateWithWeb(type: SummaryEntityType, loaded: Loaded) {
    let found: ReturnType<typeof selectWebSources> = [];
    const query = this.webEnabled && this.research.enabled ? buildWebQuery(loaded.ctx.facts) : null;
    if (query) {
      try {
        const r = await this.research.session(1, { ttlHours: 24 * 7 }).run(query, { kind: "search", num: 8, topic: "ai-summary" });
        found = selectWebSources(r.items, loaded.name);
      } catch (e) {
        this.logger.warn(`AI summary web context skipped (${(e as Error).message})`);
      }
    }
    const summary = await this.generator.generate(type, loaded.ctx.facts, found);
    const cited = citedSources(`${summary.overview} ${summary.highlights.join(" ")}`, found);
    return { summary, web: cited.map(({ id, title, url, site }) => ({ id, title, url, site })) };
  }

  private assertUnderHourlyCap(): void {
    const cutoff = Date.now() - 3600_000;
    while (this.generationTimes.length && this.generationTimes[0] < cutoff) this.generationTimes.shift();
    if (this.generationTimes.length >= this.maxPerHour) throw new HttpException("AI summaries are busy right now. Please try again shortly.", HttpStatus.TOO_MANY_REQUESTS);
    this.generationTimes.push(Date.now());
  }

  /** Loads only the public profile fields for one organization (never documents, contacts, team members or scores) and turns them into the AI input. */
  private async load(type: SummaryEntityType, idParam: string): Promise<Loaded | null> {
    const where = UUID.test(idParam) ? [{ slug: idParam }, { id: idParam }] : [{ slug: idParam }];
    const kind = ENTITY_KIND_BY_TYPE[type];
    switch (type) {
      case "startups": {
        const s = await this.startups.findOne({ where });
        if (!s) return null;
        return { id: s.id, name: s.name, ctx: buildStartupContext(s, { sectors: await this.shared.getSectorNames(kind, s.id) }) };
      }
      case "investors": {
        const v = await this.investors.findOne({ where });
        if (!v) return null;
        return { id: v.id, name: v.name, ctx: buildInvestorContext(v, { sectors: await this.shared.getSectorNames(kind, v.id) }) };
      }
      case "hubs": {
        const h = await this.hubs.findOne({ where });
        if (!h) return null;
        const [sectors, programs] = await Promise.all([this.shared.getSectorNames(kind, h.id), this.hubPrograms.find({ where: { hubId: h.id } })]);
        return { id: h.id, name: h.name, ctx: buildHubContext(h, { sectors, programs }) };
      }
      case "multinationals": {
        const m = await this.multinationals.findOne({ where });
        if (!m) return null;
        const [sectors, products, partnerships] = await Promise.all([this.shared.getSectorNames(kind, m.id), this.shared.getProducts(kind, m.id), this.shared.getPartnerships(kind, m.id)]);
        return { id: m.id, name: m.name, ctx: buildMultinationalContext(m, { sectors, products, partnerships }) };
      }
    }
  }
}
