import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { User } from "../users/user.entity";
import { Event } from "../events/event.entity";
import { GoogleCalendarConnection } from "./google-calendar-connection.entity";
import { CalendarEventLink } from "./calendar-event-link.entity";
import { TokenCrypto } from "./token-crypto";

/** Least privilege that can create events. `openid email` is only used to
 * check that the Google account is the one tied to the RUWĀD email. */
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const CALENDAR_SCOPE = SCOPES[2];
const STATE_TTL_MS = 10 * 60 * 1000;
const RETURN_PATHS = ["/news", "/dashboard", "/settings"];

export type ConnectResult = "connected" | "denied" | "email_mismatch" | "error";

interface StatePayload { u: string; n: string; r: string; e: number; p: "gcal" }
interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string }

class ReconnectRequired extends Error {}

/** Google Calendar (OAuth 2.0, server side). Events are created ONLY from
 * addEvent(), which the controller exposes as one POST per explicit click —
 * nothing here runs on login, connect, page load or view. */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly crypto: TokenCrypto;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly stateKey: Buffer;
  private readonly frontendOrigin: string;
  private readonly urls: { auth: string; token: string; userinfo: string; revoke: string; api: string };
  /** Collapses simultaneous identical requests from the same user (double click). */
  private readonly inFlight = new Map<string, Promise<{ status: "added" | "already_added"; htmlLink: string | null }>>();

  constructor(
    config: ConfigService,
    @InjectRepository(GoogleCalendarConnection) private readonly conns: Repository<GoogleCalendarConnection>,
    @InjectRepository(CalendarEventLink) private readonly links: Repository<CalendarEventLink>,
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    this.crypto = new TokenCrypto(config.get<string>("TOKEN_ENCRYPTION_KEY"));
    this.clientId = (config.get<string>("GOOGLE_CLIENT_ID") ?? "").trim();
    this.clientSecret = (config.get<string>("GOOGLE_CLIENT_SECRET") ?? "").trim();
    this.redirectUri = (config.get<string>("GOOGLE_REDIRECT_URI") ?? "").trim();
    this.stateKey = createHash("sha256").update(`gcal-oauth-state:${config.get<string>("JWT_SECRET") ?? ""}`).digest();
    this.frontendOrigin = (config.get<string>("FRONTEND_URL") ?? "http://localhost:5174").split(",")[0].trim().replace(/\/+$/, "");
    // A test double may replace Google, but never in production.
    const test = config.get("NODE_ENV") !== "production" ? (config.get<string>("GOOGLE_TEST_BASE_URL") ?? "").replace(/\/+$/, "") : "";
    this.urls = test
      ? { auth: `${test}/auth`, token: `${test}/token`, userinfo: `${test}/userinfo`, revoke: `${test}/revoke`, api: `${test}/calendar/v3` }
      : { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", userinfo: "https://openidconnect.googleapis.com/v1/userinfo", revoke: "https://oauth2.googleapis.com/revoke", api: "https://www.googleapis.com/calendar/v3" };
    if (!this.configured) this.logger.warn("Google Calendar isn't configured — direct add is off; calendar links still work.");
  }

  get configured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri && this.crypto.available);
  }

  /* ------------------------------------------------------------ state ---- */
  private sign(payload: StatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${createHmac("sha256", this.stateKey).update(body).digest("base64url")}`;
  }

  private verify(state: string | undefined): StatePayload | null {
    if (!state || state.length > 2000) return null;
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const want = createHmac("sha256", this.stateKey).update(body).digest();
    const got = Buffer.from(sig, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
      return p.p === "gcal" && typeof p.u === "string" && typeof p.n === "string" && p.e > Date.now() ? p : null;
    } catch { return null; }
  }

  /** Only our own pages, never an arbitrary URL. */
  safeReturnPath(raw: unknown): string {
    return typeof raw === "string" && RETURN_PATHS.includes(raw) ? raw : "/news";
  }

  redirectUrl(returnPath: string, result: ConnectResult): string {
    return `${this.frontendOrigin}${this.safeReturnPath(returnPath)}?calendar=${result}`;
  }

  /* ---------------------------------------------------------- connect ---- */
  async startConnect(userId: string, returnTo: unknown): Promise<{ authUrl: string; cookie: string }> {
    if (!this.configured) throw new ServiceUnavailableException("unavailable");
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const nonce = randomBytes(16).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const state = this.sign({ u: userId, n: nonce, r: this.safeReturnPath(returnTo), e: Date.now() + STATE_TTL_MS, p: "gcal" });
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      login_hint: user.email,
    });
    return { authUrl: `${this.urls.auth}?${q.toString()}`, cookie: `${nonce}.${verifier}` };
  }

  async handleCallback(query: { code?: string; state?: string; error?: string }, cookie: string | undefined): Promise<{ result: ConnectResult; returnPath: string }> {
    const st = this.verify(query.state);
    if (!st) return { result: "error", returnPath: "/news" };
    const returnPath = this.safeReturnPath(st.r);
    const fail = (result: ConnectResult) => ({ result, returnPath });
    if (!this.configured) return fail("error");

    // The browser that started the flow must be the one finishing it.
    const [nonce, verifier] = (cookie ?? "").split(".");
    const a = Buffer.from(nonce ?? ""), b = Buffer.from(st.n);
    if (!nonce || !verifier || a.length !== b.length || !timingSafeEqual(a, b)) return fail("error");
    if (query.error) return fail(query.error === "access_denied" ? "denied" : "error");
    if (!query.code || query.code.length > 2000) return fail("error");

    let tokens: TokenResponse;
    try {
      tokens = await this.tokenRequest({ grant_type: "authorization_code", code: query.code, code_verifier: verifier, redirect_uri: this.redirectUri });
    } catch { return fail("error"); }
    if (!tokens.access_token) return fail("error");

    // Only the minimum permission is acceptable; a partially-granted consent isn't usable.
    if (!(tokens.scope ?? "").split(/\s+/).includes(CALENDAR_SCOPE)) {
      await this.revoke(tokens.refresh_token ?? tokens.access_token);
      return fail("denied");
    }

    const user = await this.users.findOne({ where: { id: st.u } });
    let info: { email?: string; email_verified?: boolean } | null = null;
    try { info = await this.getJson(this.urls.userinfo, tokens.access_token); } catch { info = null; }
    const googleEmail = (info?.email ?? "").trim().toLowerCase();
    if (!user || !googleEmail || info?.email_verified === false || googleEmail !== user.email.trim().toLowerCase()) {
      await this.revoke(tokens.refresh_token ?? tokens.access_token); // nothing is kept
      return fail(user && googleEmail ? "email_mismatch" : "error");
    }

    const existing = await this.conns.findOne({ where: { userId: user.id } });
    const refresh = tokens.refresh_token;
    if (!refresh && !existing) { await this.revoke(tokens.access_token); return fail("error"); }
    const row = existing ?? this.conns.create({ userId: user.id });
    row.googleEmail = googleEmail;
    if (refresh) row.refreshTokenEnc = this.crypto.encrypt(refresh);
    row.accessTokenEnc = this.crypto.encrypt(tokens.access_token);
    row.accessTokenExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    row.scope = tokens.scope ?? CALENDAR_SCOPE;
    row.status = "active";
    row.connectedAt = new Date();
    await this.conns.save(row);
    return { result: "connected", returnPath };
  }

  async status(userId: string) {
    if (!this.configured) return { configured: false, connected: false, needsReconnect: false, email: null, addedEventIds: [] as string[] };
    const conn = await this.conns.findOne({ where: { userId } });
    const links = await this.links.find({ where: { userId }, select: { eventId: true }, take: 500 });
    return {
      configured: true,
      connected: conn?.status === "active",
      needsReconnect: conn?.status === "reauth_required",
      email: conn?.googleEmail ?? null,
      addedEventIds: links.map((l) => l.eventId),
    };
  }

  async disconnect(userId: string): Promise<void> {
    const conn = await this.conns.findOne({ where: { userId } });
    if (!conn) return;
    try { await this.revoke(this.crypto.decrypt(conn.refreshTokenEnc)); } catch { /* best effort */ }
    await this.conns.delete({ userId });
  }

  /* ---------------------------------------------------- add one event ---- */
  addEvent(userId: string, eventId: string): Promise<{ status: "added" | "already_added"; htmlLink: string | null }> {
    if (!this.configured) throw new ServiceUnavailableException("unavailable");
    const key = `${userId}:${eventId}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = this.doAddEvent(userId, eventId).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private async doAddEvent(userId: string, eventId: string) {
    const event = await this.events.findOne({ where: { id: eventId, isPublished: true } });
    if (!event || !event.startDate) throw new NotFoundException();

    const already = await this.links.findOne({ where: { userId, eventId } });
    if (already) return { status: "already_added" as const, htmlLink: already.htmlLink ?? null };

    const start = String(event.startDate).slice(0, 10);
    const last = event.endDate && String(event.endDate).slice(0, 10) >= start ? String(event.endDate).slice(0, 10) : start;
    if (last < new Date().toISOString().slice(0, 10)) throw new BadRequestException("event_ended");

    const conn = await this.conns.findOne({ where: { userId } });
    if (!conn) throw new ConflictException("not_connected");
    if (conn.status !== "active") throw new ConflictException("reconnect_required");

    // Google event ids may only use a–v and 0–9 (base32hex): hex digits qualify, and so does the "rd" prefix.
    const googleId = `rd${createHash("sha256").update(`${userId}:${eventId}`).digest("hex")}`; // deterministic → Google refuses a second copy
    const body = {
      id: googleId,
      summary: event.name,
      location: [event.venue, event.city, event.country].filter(Boolean).join(", ") || event.location || undefined,
      description: this.notes(event),
      start: { date: start }, // all-day: no time is ever invented
      end: { date: this.nextDay(last) },
      ...(this.isHttp(event.url) ? { source: { title: "RUWĀD", url: event.url } } : {}),
    };

    let htmlLink: string | null;
    try {
      htmlLink = await this.insertWithRefresh(conn, body);
    } catch (e) {
      if (e instanceof ReconnectRequired) throw new ConflictException("reconnect_required");
      this.logger.warn(`Google Calendar add failed: ${e instanceof Error ? e.message : "unknown error"}`);
      throw new BadGatewayException("add_failed");
    }

    try {
      await this.links.save(this.links.create({ userId, eventId, googleEventId: googleId, htmlLink }));
    } catch (e: any) {
      if (e?.code !== "23505") throw e; // a concurrent request already recorded it
    }
    await this.conns.update({ userId }, { lastUsedAt: new Date() });
    return { status: "added" as const, htmlLink };
  }

  private async insertWithRefresh(conn: GoogleCalendarConnection, body: Record<string, unknown>): Promise<string | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(conn, attempt > 0);
      const res = await this.fetchJson(`${this.urls.api}/calendars/primary/events`, { method: "POST", token, body });
      if (res.status === 200 || res.status === 201) return (res.json?.htmlLink as string) ?? null;
      if (res.status === 409) return this.reviveIfCancelled(token, String(body.id), body);
      if (res.status === 401 && attempt === 0) continue; // cached token was rejected → refresh once
      const reason = ((res.json?.error as { errors?: { reason?: string }[] } | undefined)?.errors?.[0]?.reason) ?? "";
      if (res.status === 401 || (res.status === 403 && reason === "insufficientPermissions")) {
        await this.markReauth(conn);
        throw new ReconnectRequired();
      }
      throw new Error(`Google Calendar responded ${res.status}`);
    }
    throw new Error("unreachable");
  }

  /** The id already exists: either the event is there (fine), or the user deleted it and Google keeps the id as "cancelled". */
  private async reviveIfCancelled(token: string, id: string, body: Record<string, unknown>): Promise<string | null> {
    const url = `${this.urls.api}/calendars/primary/events/${encodeURIComponent(id)}`;
    const got = await this.fetchJson(url, { method: "GET", token });
    if (got.status !== 200) throw new Error(`Google Calendar responded ${got.status}`);
    if (got.json?.status !== "cancelled") return (got.json?.htmlLink as string) ?? null;
    const put = await this.fetchJson(url, { method: "PUT", token, body: { ...body, status: "confirmed" } });
    if (put.status !== 200) throw new Error(`Google Calendar responded ${put.status}`);
    return (put.json?.htmlLink as string) ?? null;
  }

  private async accessToken(conn: GoogleCalendarConnection, forceRefresh: boolean): Promise<string> {
    if (!forceRefresh && conn.accessTokenEnc && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
      try { return this.crypto.decrypt(conn.accessTokenEnc); } catch { /* fall through to a refresh */ }
    }
    let tokens: TokenResponse;
    try {
      tokens = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: this.crypto.decrypt(conn.refreshTokenEnc) });
    } catch (e) {
      if (e instanceof ReconnectRequired) await this.markReauth(conn);
      throw e;
    }
    if (!tokens.access_token) throw new Error("No access token returned");
    conn.accessTokenEnc = this.crypto.encrypt(tokens.access_token);
    conn.accessTokenExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    await this.conns.update({ userId: conn.userId }, { accessTokenEnc: conn.accessTokenEnc, accessTokenExpiresAt: conn.accessTokenExpiresAt });
    return tokens.access_token;
  }

  private async markReauth(conn: GoogleCalendarConnection) {
    conn.status = "reauth_required";
    await this.conns.update({ userId: conn.userId }, { status: "reauth_required", accessTokenEnc: null, accessTokenExpiresAt: null });
  }

  /* ------------------------------------------------------------- http ---- */
  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(this.urls.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...params }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (res.ok) return json;
    // Only the HTTP status and Google's short error code are ever surfaced — never a token or response body.
    if (json.error === "invalid_grant") throw new ReconnectRequired("invalid_grant");
    throw new Error(`Google token endpoint responded ${res.status}`);
  }

  private async getJson<T>(url: string, token: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Google responded ${res.status}`);
    return (await res.json()) as T;
  }

  private async fetchJson(url: string, o: { method: string; token: string; body?: unknown }): Promise<{ status: number; json: Record<string, unknown> | null }> {
    const res = await fetch(url, {
      method: o.method,
      headers: { Authorization: `Bearer ${o.token}`, "Content-Type": "application/json" },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      signal: AbortSignal.timeout(15_000),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  }

  private async revoke(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      await fetch(this.urls.revoke, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString(), signal: AbortSignal.timeout(10_000) });
    } catch { /* best effort */ }
  }

  /* ---------------------------------------------------------- helpers ---- */
  private isHttp(u: string): boolean {
    try { const p = new URL(u); return p.protocol === "http:" || p.protocol === "https:"; } catch { return false; }
  }

  private nextDay(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }

  private notes(e: Event): string {
    const desc = (e.description ?? "").replace(/\s+/g, " ").trim();
    const short = desc.length > 300 ? desc.slice(0, 299).replace(/\s+\S*$/, "") + "…" : desc;
    return [short, this.isHttp(e.url) ? `Source: ${e.url}` : ""].filter(Boolean).join("\n\n");
  }
}
