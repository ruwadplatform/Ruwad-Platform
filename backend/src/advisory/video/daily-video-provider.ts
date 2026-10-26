import { RoomSpec, TokenSpec, VideoProvider, VideoProviderError } from "./video-provider";

/** The REAL provider: Daily's REST API (https://docs.daily.co/reference/rest-api). It is only used when ADVISORY_VIDEO_PROVIDER=daily AND
 * DAILY_API_KEY and DAILY_DOMAIN are present. Nothing here has been run against the live service: no account or credentials exist yet, so it is
 * tested against a fake server only (see daily-video-provider.spec.ts). Verify it once, supervised, with two people, before relying on it.
 *
 * What it will NOT do, by construction: it never asks for recording (no recording or transcription property appears in any request: a test asserts
 * this), never makes a public room, and never issues a token without a room name (a token without one opens ANY room on the domain). */

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/** The room we create. Private (a token is required), time-boxed, small, chat and screen sharing on, and no recording anywhere. */
export function dailyRoomPayload(spec: RoomSpec) {
  return {
    name: spec.name,
    privacy: "private",
    properties: {
      nbf: unix(spec.notBefore),
      exp: unix(spec.expiresAt),
      max_participants: spec.maxParticipants,
      eject_at_room_exp: true,
      enable_chat: true,
      enable_screenshare: true,
      enable_prejoin_ui: true,
      enable_knocking: false,
    },
  };
}

/** The token we mint: one room, one person, a time window, ejected when it expires. Owner only for the advisor. */
export function dailyTokenPayload(spec: TokenSpec) {
  return {
    properties: {
      room_name: spec.roomName,
      user_id: spec.userId,
      user_name: spec.userName,
      is_owner: spec.isOwner,
      nbf: unix(spec.notBefore),
      exp: unix(spec.expiresAt),
      eject_at_token_exp: true,
    },
  };
}

export interface DailyConfig {
  apiKey: string;
  /** e.g. "ruwad" for https://ruwad.daily.co */
  domain: string;
  apiBase: string;
  timeoutMs: number;
}

export class DailyVideoProvider implements VideoProvider {
  readonly kind = "daily" as const;

  constructor(private readonly cfg: DailyConfig) {}

  private async call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.apiBase}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch {
      // Network failure or timeout. The message deliberately says nothing about the request: no key, no URL parameters.
      throw new VideoProviderError("The video provider could not be reached");
    }
    let json: Record<string, unknown> | null = null;
    try { json = (await res.json()) as Record<string, unknown>; } catch { /* no body */ }
    return { status: res.status, json };
  }

  async ensureRoom(spec: RoomSpec): Promise<{ url: string | null }> {
    const created = await this.call("POST", "/rooms", dailyRoomPayload(spec));
    if (created.status >= 200 && created.status < 300) return { url: typeof created.json?.url === "string" ? created.json.url : this.roomUrl(spec.name) };
    // Already there (a second person joining, or a retry): that is fine.
    if (created.status === 400 || created.status === 409) {
      const existing = await this.call("GET", `/rooms/${encodeURIComponent(spec.name)}`);
      if (existing.status === 200) return { url: typeof existing.json?.url === "string" ? existing.json.url : this.roomUrl(spec.name) };
    }
    throw new VideoProviderError(`The video provider refused to create the room (${created.status})`, created.status);
  }

  async createToken(spec: TokenSpec): Promise<{ token: string }> {
    if (!spec.roomName) throw new VideoProviderError("A meeting token must name a room");
    const res = await this.call("POST", "/meeting-tokens", dailyTokenPayload(spec));
    const token = res.json?.token;
    if (res.status >= 200 && res.status < 300 && typeof token === "string" && token) return { token };
    throw new VideoProviderError(`The video provider refused to issue a token (${res.status})`, res.status);
  }

  async deleteRoom(name: string): Promise<void> {
    const res = await this.call("DELETE", `/rooms/${encodeURIComponent(name)}`);
    if ((res.status >= 200 && res.status < 300) || res.status === 404) return;
    throw new VideoProviderError(`The video provider refused to delete the room (${res.status})`, res.status);
  }

  private roomUrl(name: string): string {
    return `https://${this.cfg.domain}.daily.co/${name}`;
  }
}
