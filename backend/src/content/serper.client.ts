import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface SerperNewsItem { title: string; link: string; snippet?: string; date?: string; source?: string; imageUrl?: string }
export interface SerperOrganicItem { title: string; link: string; snippet?: string; date?: string; position?: number }
/** Google's "knowledge panel" block, when Serper returns one for a query. */
export interface SerperKnowledgeGraph { title?: string; type?: string; website?: string; description?: string; attributes?: Record<string, string> }
export interface SerperSearchResult { organic: SerperOrganicItem[]; knowledgeGraph: SerperKnowledgeGraph | null }

const REQUEST_TIMEOUT_MS = 15_000;

/** Thin backend-only wrapper around Serper (google.serper.dev). The API key is
 * read from process env here and nowhere else; it goes only into the
 * X-API-KEY request header — never into a log line, an error message, a
 * response to the frontend or a URL. Failures surface as a short generic
 * message so raw provider output can't leak. */
@Injectable()
export class SerperClient {
  private readonly logger = new Logger(SerperClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = (config.get<string>("SERPER_API_KEY") ?? "").trim();
    // Overridable only outside production (tests point this at a local fake).
    const override = config.get<string>("SERPER_BASE_URL");
    this.baseUrl = (config.get<string>("NODE_ENV") !== "production" && override ? override : "https://google.serper.dev").replace(/\/+$/, "");
    if (!this.apiKey) this.logger.warn("SERPER_API_KEY not set — automatic news/events collection and report/pitch-deck research are disabled.");
  }

  get enabled(): boolean { return this.apiKey.length > 0; }

  async news(q: string, gl: string, opts: { num?: number; tbs?: string } = {}): Promise<SerperNewsItem[]> {
    const body = await this.post("/news", { q, gl, hl: "en", num: opts.num ?? 10, tbs: opts.tbs ?? "qdr:w" });
    const items = Array.isArray(body?.news) ? body.news : [];
    return items.filter((i: SerperNewsItem) => i && typeof i.title === "string" && typeof i.link === "string");
  }

  async search(q: string, gl: string, opts: { num?: number } = {}): Promise<SerperOrganicItem[]> {
    const body = await this.post("/search", { q, gl, hl: "en", num: opts.num ?? 10 });
    const items = Array.isArray(body?.organic) ? body.organic : [];
    return items.filter((i: SerperOrganicItem) => i && typeof i.title === "string" && typeof i.link === "string");
  }

  /** Same /search request as search(), but also returns result positions and the knowledge-graph block.
   * Used by the reports and pitch-deck research; search() itself is unchanged (events collection uses it). */
  async searchDetailed(q: string, gl: string, opts: { num?: number; tbs?: string } = {}): Promise<SerperSearchResult> {
    const payload: Record<string, unknown> = { q, gl, hl: "en", num: opts.num ?? 10 };
    if (opts.tbs) payload.tbs = opts.tbs;
    const body = await this.post("/search", payload);
    const organic = (Array.isArray(body?.organic) ? body.organic : []).filter((i: SerperOrganicItem) => i && typeof i.title === "string" && typeof i.link === "string");
    const kg = body?.knowledgeGraph;
    const knowledgeGraph: SerperKnowledgeGraph | null = kg && typeof kg === "object"
      ? {
          title: typeof kg.title === "string" ? kg.title : undefined,
          type: typeof kg.type === "string" ? kg.type : undefined,
          website: typeof kg.website === "string" ? kg.website : undefined,
          description: typeof kg.description === "string" ? kg.description : undefined,
          attributes: kg.attributes && typeof kg.attributes === "object"
            ? Object.fromEntries(Object.entries(kg.attributes).filter(([, v]) => typeof v === "string")) as Record<string, string>
            : undefined,
        }
      : null;
    return { organic, knowledgeGraph };
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<any> {
    if (!this.enabled) throw new Error("Serper is not configured");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(this.baseUrl + path, {
        method: "POST",
        headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      // Status only — the provider's response body is never echoed anywhere.
      if (!res.ok) throw new Error(`Serper request failed (HTTP ${res.status})`);
      return await res.json();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw new Error("Serper request timed out");
      if (e instanceof Error && e.message.startsWith("Serper")) throw e;
      throw new Error("Serper request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}
