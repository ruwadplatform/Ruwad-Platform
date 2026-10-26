import * as http from "http";
import { AddressInfo } from "net";
import { BookingStatus } from "../advisory.enums";
import { MEETING_NOTICE, meetingState, meetingWindow } from "../meeting-window";
import { newRoomName } from "../advisory-meeting.service";
import { DailyVideoProvider, dailyRoomPayload, dailyTokenPayload } from "./daily-video-provider";
import { MockVideoProvider } from "./mock-video-provider";
import { readVideoConfig } from "./video-config";
import { VideoProviderError } from "./video-provider";

const at = (iso: string) => new Date(iso);
const S = { opensBeforeMinutes: 10, closesAfterMinutes: 15 };
const start = at("2026-11-10T10:00:00Z");
const end = at("2026-11-10T10:30:00Z");

describe("when the meeting room is open", () => {
  it("opens 10 minutes before the start and closes 15 minutes after the end", () => {
    const w = meetingWindow(start, end, S);
    expect(w.opensAt).toEqual(at("2026-11-10T09:50:00Z"));
    expect(w.closesAt).toEqual(at("2026-11-10T10:45:00Z"));
  });

  it("is NOT_OPEN, OPEN, then ENDED as time passes, inclusive at both edges", () => {
    const st = (iso: string) => meetingState(BookingStatus.CONFIRMED, start, end, at(iso), S);
    expect(st("2026-11-10T09:49:59Z")).toBe("NOT_OPEN");
    expect(st("2026-11-10T09:50:00Z")).toBe("OPEN");
    expect(st("2026-11-10T10:10:00Z")).toBe("OPEN");
    expect(st("2026-11-10T10:45:00Z")).toBe("OPEN");
    expect(st("2026-11-10T10:45:01Z")).toBe("ENDED");
  });

  it("there is no meeting unless the booking is CONFIRMED", () => {
    for (const status of [BookingStatus.PENDING, BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED, BookingStatus.RESCHEDULED, BookingStatus.COMPLETED, BookingStatus.RESCHEDULE_PROPOSED]) {
      expect(meetingState(status, start, end, at("2026-11-10T10:10:00Z"), S)).toBe("NOT_CONFIRMED");
    }
  });

  it("the privacy notice says it is not recorded and warns against patient-identifiable information", () => {
    expect(MEETING_NOTICE).toMatch(/not recorded/i);
    expect(MEETING_NOTICE).toMatch(/patient-identifiable/i);
  });
});

describe("video settings", () => {
  const read = (env: Record<string, string>) => readVideoConfig((k) => env[k]);

  it("the default is simulated rooms, configured, with the documented window", () => {
    expect(read({})).toMatchObject({ requested: "mock", configured: true, opensBeforeMinutes: 10, closesAfterMinutes: 15, maxParticipants: 4 });
  });

  it("'daily' needs BOTH a key and a domain; without them it is reported as not configured (never silently faked)", () => {
    expect(read({ ADVISORY_VIDEO_PROVIDER: "daily" })).toMatchObject({ requested: "daily", configured: false });
    expect(read({ ADVISORY_VIDEO_PROVIDER: "daily", DAILY_API_KEY: "k" })).toMatchObject({ configured: false });
    expect(read({ ADVISORY_VIDEO_PROVIDER: "daily", DAILY_DOMAIN: "d" })).toMatchObject({ configured: false });
    expect(read({ ADVISORY_VIDEO_PROVIDER: "daily", DAILY_API_KEY: "k", DAILY_DOMAIN: "d" })).toMatchObject({ requested: "daily", configured: true });
  });

  it("only the exact word 'daily' selects Daily", () => {
    for (const v of ["", "Daily", "DAILY", "true", "live"]) expect(read({ ADVISORY_VIDEO_PROVIDER: v, DAILY_API_KEY: "k", DAILY_DOMAIN: "d" }).requested).toBe("mock");
  });

  it("numbers are clamped", () => {
    expect(read({ ADVISORY_MEETING_OPENS_MINUTES: "0" }).opensBeforeMinutes).toBe(1);
    expect(read({ ADVISORY_MEETING_MAX_PARTICIPANTS: "500" }).maxParticipants).toBe(10);
  });
});

describe("room names", () => {
  it("are unguessable and carry nothing about the booking", () => {
    const names = new Set(Array.from({ length: 200 }, () => newRoomName()));
    expect(names.size).toBe(200);
    for (const n of names) expect(n).toMatch(/^ruwad-[a-z2-7]{20}$/);
  });
});

describe("the simulated provider", () => {
  it("makes no URL, hands out distinct throwaway tokens, and remembers what it did", async () => {
    const p = new MockVideoProvider();
    expect(await p.ensureRoom({ name: "r1", notBefore: start, expiresAt: end, maxParticipants: 4 })).toEqual({ url: null });
    const a = await p.createToken({ roomName: "r1", userId: "u1", userName: "A", isOwner: true, notBefore: start, expiresAt: end });
    const b = await p.createToken({ roomName: "r1", userId: "u2", userName: "B", isOwner: false, notBefore: start, expiresAt: end });
    expect(a.token).not.toBe(b.token);
    expect(a.token.startsWith("simulated.")).toBe(true);
    await p.deleteRoom("r1");
    expect(p.deleted).toEqual(["r1"]);
    expect(p.rooms.size).toBe(0);
  });
});

describe("what we ask Daily for", () => {
  const room = dailyRoomPayload({ name: "ruwad-abc", notBefore: start, expiresAt: at("2026-11-10T10:45:00Z"), maxParticipants: 4 });
  const token = dailyTokenPayload({ roomName: "ruwad-abc", userId: "u1", userName: "Dr A", isOwner: true, notBefore: start, expiresAt: at("2026-11-10T10:45:00Z") });

  it("the room is private (a token is required), time-boxed, small, and ejects people when it expires", () => {
    expect(room.privacy).toBe("private");
    expect(room.properties).toMatchObject({ nbf: Math.floor(start.getTime() / 1000), exp: Math.floor(at("2026-11-10T10:45:00Z").getTime() / 1000), max_participants: 4, eject_at_room_exp: true, enable_chat: true, enable_screenshare: true, enable_knocking: false });
  });

  it("the token names exactly one room and one person, has a window, and ejects at expiry", () => {
    expect(token.properties).toMatchObject({ room_name: "ruwad-abc", user_id: "u1", user_name: "Dr A", is_owner: true, eject_at_token_exp: true });
    expect(token.properties.exp).toBeGreaterThan(token.properties.nbf);
  });

  it("recording, transcription and streaming are never requested, anywhere", () => {
    const everything = JSON.stringify([room, token]).toLowerCase();
    for (const word of ["record", "transcri", "stream", "broadcast", "live_stream"]) expect(everything).not.toContain(word);
  });
});

/** A throwaway HTTP server standing in for Daily, so the provider's real requests can be inspected. */
function fakeDaily(handler: (req: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }) => { status: number; json?: unknown; delayMs?: number }) {
  const seen: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const entry = { method: req.method!, url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : undefined };
      seen.push(entry);
      const out = handler(entry);
      setTimeout(() => { res.statusCode = out.status; res.setHeader("content-type", "application/json"); res.end(out.json === undefined ? "" : JSON.stringify(out.json)); }, out.delayMs ?? 0);
    });
  });
  return new Promise<{ base: string; seen: typeof seen; close: () => Promise<void> }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, seen, close: () => new Promise((r) => server.close(() => r())) })));
}

describe("the Daily provider, against a fake Daily", () => {
  const spec = { name: "ruwad-room1", notBefore: start, expiresAt: at("2026-11-10T10:45:00Z"), maxParticipants: 4 };
  const KEY = "test-key-not-real-abcdef";
  const provider = (base: string, timeoutMs = 2000) => new DailyVideoProvider({ apiKey: KEY, domain: "ruwad", apiBase: base, timeoutMs });

  it("creates a private room with the bearer key, and returns the room URL", async () => {
    const d = await fakeDaily(() => ({ status: 200, json: { name: "ruwad-room1", url: "https://ruwad.daily.co/ruwad-room1" } }));
    try {
      expect(await provider(d.base).ensureRoom(spec)).toEqual({ url: "https://ruwad.daily.co/ruwad-room1" });
      expect(d.seen).toHaveLength(1);
      expect(d.seen[0]!.method).toBe("POST");
      expect(d.seen[0]!.url).toBe("/v1/rooms");
      expect(d.seen[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(d.seen[0]!.body.privacy).toBe("private");
    } finally { await d.close(); }
  });

  it("a room that already exists is fine: it looks it up instead of failing", async () => {
    const d = await fakeDaily((r) => (r.method === "POST" ? { status: 400, json: { error: "invalid-request-error", info: "a room named ruwad-room1 already exists" } } : { status: 200, json: { url: "https://ruwad.daily.co/ruwad-room1" } }));
    try {
      expect(await provider(d.base).ensureRoom(spec)).toEqual({ url: "https://ruwad.daily.co/ruwad-room1" });
      expect(d.seen.map((s) => `${s.method} ${s.url}`)).toEqual(["POST /v1/rooms", "GET /v1/rooms/ruwad-room1"]);
    } finally { await d.close(); }
  });

  it("issues a token for exactly one room; it never asks for recording and never sends the key in the body", async () => {
    const d = await fakeDaily(() => ({ status: 200, json: { token: "tok_abc123" } }));
    try {
      const res = await provider(d.base).createToken({ roomName: "ruwad-room1", userId: "u1", userName: "Dr A", isOwner: false, notBefore: start, expiresAt: spec.expiresAt });
      expect(res).toEqual({ token: "tok_abc123" });
      expect(d.seen[0]!.url).toBe("/v1/meeting-tokens");
      expect(d.seen[0]!.body.properties).toMatchObject({ room_name: "ruwad-room1", is_owner: false, eject_at_token_exp: true });
      expect(JSON.stringify(d.seen[0]!.body)).not.toContain(KEY);
    } finally { await d.close(); }
  });

  it("refuses to make a token with no room (such a token would open ANY room)", async () => {
    await expect(provider("http://127.0.0.1:1/v1").createToken({ roomName: "", userId: "u", userName: "n", isOwner: false, notBefore: start, expiresAt: spec.expiresAt })).rejects.toThrow(VideoProviderError);
  });

  it("a provider error never leaks the key, the response body or the URL", async () => {
    const d = await fakeDaily(() => ({ status: 401, json: { error: "authentication-error", info: `bad key ${KEY}` } }));
    try {
      const err = await provider(d.base).ensureRoom(spec).catch((e) => e);
      expect(err).toBeInstanceOf(VideoProviderError);
      expect(err.message).not.toContain(KEY);
      expect(err.message).not.toContain("bad key");
      expect(err.message).not.toContain("127.0.0.1");
    } finally { await d.close(); }
  });

  it("a server that is down or too slow is a clean VideoProviderError, not a hang", async () => {
    const down = await provider("http://127.0.0.1:1/v1").ensureRoom(spec).catch((e) => e);
    expect(down).toBeInstanceOf(VideoProviderError);
    const slow = await fakeDaily(() => ({ status: 200, json: {}, delayMs: 1500 }));
    try {
      const t0 = Date.now();
      const err = await provider(slow.base, 300).ensureRoom(spec).catch((e) => e);
      expect(err).toBeInstanceOf(VideoProviderError);
      expect(Date.now() - t0).toBeLessThan(1400);
    } finally { await slow.close(); }
  });

  it("deleting a room that is already gone is not an error; any other refusal is", async () => {
    const gone = await fakeDaily(() => ({ status: 404, json: {} }));
    try { await expect(provider(gone.base).deleteRoom("x")).resolves.toBeUndefined(); } finally { await gone.close(); }
    const bad = await fakeDaily(() => ({ status: 500, json: {} }));
    try { await expect(provider(bad.base).deleteRoom("x")).rejects.toThrow(VideoProviderError); } finally { await bad.close(); }
  });
});
