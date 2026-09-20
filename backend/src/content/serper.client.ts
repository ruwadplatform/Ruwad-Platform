import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface SerperNewsItem { title: string; link: string; snippet?: string; date?: string; source?: string; imageUrl?: string }
export interface SerperOrganicItem { title: string; link: string; snippet?: string; date?: string }

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
    if (!this.apiKey) this.logger.warn("SERPER_API_KEY not set — automatic news/events collection is disabled.");
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
