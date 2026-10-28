/* eslint-disable @typescript-eslint/no-var-requires */
import * as http from "http";
import { AddressInfo } from "net";
import { checkDailyWebhook, signDailyWebhook } from "../advisory/attendance-logic";

// The live-test helper is a plain Node script (it is run by hand, never built), so it is loaded with require.
const live = require("../../scripts/dev/daily-webhook-live");

const SECRET = Buffer.from("a-live-test-secret-that-is-long-enough-xx").toString("base64");

describe("Daily webhook live-test helper: what it will and will not register", () => {
  it("accepts only an https URL on a temporary tunnel host, ending in the webhook path", () => {
    expect(live.assertRegistrableUrl("https://quiet-lamp-1234.trycloudflare.com/api/advisory/webhooks/daily")).toBe("https://quiet-lamp-1234.trycloudflare.com/api/advisory/webhooks/daily");
    expect(live.assertRegistrableUrl("https://abc-123.ngrok-free.app/api/advisory/webhooks/daily")).toContain("ngrok-free.app");
  });

  it("refuses production hosts, http, other paths, credentials, queries and unknown hosts", () => {
    const bad = [
      "https://www.ruwad.studio/api/advisory/webhooks/daily",
      "https://ruwad-backend.cs.amazonlightsail.com/api/advisory/webhooks/daily",
      "https://ruwad-backend-e92x.onrender.com/api/advisory/webhooks/daily",
      "https://x.supabase.co/api/advisory/webhooks/daily",
      "http://quiet-lamp.trycloudflare.com/api/advisory/webhooks/daily",
      "https://quiet-lamp.trycloudflare.com/api/advisory/webhooks/other",
      "https://quiet-lamp.trycloudflare.com/",
      "https://user:topsecret@quiet-lamp.trycloudflare.com/api/advisory/webhooks/daily",
      "https://quiet-lamp.trycloudflare.com/api/advisory/webhooks/daily?x=1",
      "https://example.com/api/advisory/webhooks/daily",
      "not a url",
    ];
    for (const url of bad) {
      let message = "";
      try { live.assertRegistrableUrl(url, {}); } catch (e) { message = (e as Error).message; }
      expect(message).not.toBe("");
      expect(message).not.toContain("topsecret");
    }
  });

  it("one other host can be allowed explicitly, but a production host never can", () => {
    expect(live.assertRegistrableUrl("https://my-tunnel.example.net/api/advisory/webhooks/daily", { LOCAL_WEBHOOK_PUBLIC_HOST: "my-tunnel.example.net" })).toContain("my-tunnel.example.net");
    expect(() => live.assertRegistrableUrl("https://www.ruwad.studio/api/advisory/webhooks/daily", { LOCAL_WEBHOOK_PUBLIC_HOST: "www.ruwad.studio" })).toThrow(/production host/);
    expect(live.isTunnelHost("www.ruwad.studio", { LOCAL_WEBHOOK_PUBLIC_HOST: "www.ruwad.studio" })).toBe(false); // so `delete` can never remove a production webhook
  });

  it("subscribes to participant events only, never recordings", () => {
    expect(live.EVENT_TYPES).toEqual(["participant.joined", "participant.left"]);
  });

  it("needs a real webhook secret: base64, at least 32 bytes, and never echoes it", () => {
    expect(live.readWebhookSecret({ LOCAL_DAILY_WEBHOOK_SECRET: SECRET })).toBe(SECRET);
    for (const v of [undefined, "", "short", "not base64 !!", Buffer.from("tiny").toString("base64")]) {
      let message = "";
      try { live.readWebhookSecret({ LOCAL_DAILY_WEBHOOK_SECRET: v }); } catch (e) { message = (e as Error).message; }
      expect(message).toMatch(/LOCAL_DAILY_WEBHOOK_SECRET/);
      if (v) expect(message).not.toContain(v);
    }
  });
});

describe("Daily webhook live-test helper: the single-route relay", () => {
  const upstream = { hits: [] as { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: Buffer }[] };
  let upstreamServer: http.Server, relay: http.Server, relayUrl = "";

  beforeAll(async () => {
    upstreamServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => { upstream.hits.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "processed" })); });
    });
    await new Promise<void>((ok) => upstreamServer.listen(0, "127.0.0.1", ok));
    const upstreamUrl = `http://127.0.0.1:${(upstreamServer.address() as AddressInfo).port}`;
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    relay = live.startRelay({ port: 0, upstream: upstreamUrl, minutes: 1 });
    await new Promise<void>((ok) => (relay.listening ? ok() : relay.once("listening", () => ok())));
    relayUrl = `http://127.0.0.1:${(relay.address() as AddressInfo).port}`;
  });
  afterAll(async () => { jest.restoreAllMocks(); await new Promise((ok) => relay.close(ok)); await new Promise((ok) => upstreamServer.close(ok)); });
  beforeEach(() => { upstream.hits.length = 0; });

  it("forwards the webhook byte for byte, so a signature that was valid stays valid, and passes only the headers the signature needs", async () => {
    const body = '{"version":"1.0.0","type":"participant.joined","id":"e1","payload":{"room":"r","joined_at":1708972291.567},"event_ts":1708972291.9}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signDailyWebhook(SECRET, ts, body);
    const res = await fetch(`${relayUrl}/api/advisory/webhooks/daily`, { method: "POST", headers: { "content-type": "application/json", "x-webhook-timestamp": ts, "x-webhook-signature": sig, cookie: "ruwad_token=secret-session", authorization: "Bearer secret-token" }, body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "processed" });
    expect(upstream.hits).toHaveLength(1);
    const hit = upstream.hits[0]!;
    expect(hit.method).toBe("POST");
    expect(hit.url).toBe("/api/advisory/webhooks/daily");
    expect(hit.body.toString("utf8")).toBe(body); // identical bytes
    expect(checkDailyWebhook({ secretBase64: SECRET, timestamp: hit.headers["x-webhook-timestamp"] as string, signature: hit.headers["x-webhook-signature"] as string, rawBody: hit.body, now: new Date() }).ok).toBe(true);
    expect(hit.headers.cookie).toBeUndefined();
    expect(hit.headers.authorization).toBeUndefined();
  });

  it("exposes nothing else: every other path and method is a 404 and never reaches the backend; an oversized body is refused", async () => {
    for (const [method, p] of [["GET", "/api/advisory/webhooks/daily"], ["POST", "/api/auth/login"], ["GET", "/api/health"], ["POST", "/api/advisory/webhooks/daily?x=1"], ["POST", "/"], ["DELETE", "/api/advisory/webhooks/daily"]] as const) {
      const res = await fetch(`${relayUrl}${p}`, { method, body: method === "POST" ? "{}" : undefined });
      expect(res.status).toBe(404);
    }
    expect(upstream.hits).toHaveLength(0);
    const big = await fetch(`${relayUrl}/api/advisory/webhooks/daily`, { method: "POST", body: "x".repeat(70 * 1024) }).then((r) => r.status).catch(() => 413);
    expect(big).toBe(413);
    expect(upstream.hits).toHaveLength(0);
  });
});
