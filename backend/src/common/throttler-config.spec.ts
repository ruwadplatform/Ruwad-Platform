import { Controller, Get, INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Throttle, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { peerLimit, peerMultiplier } from "./rate-limit-keys";
import { appThrottlers } from "./throttler-config";

@Controller("t")
class TController {
  @Get("strict")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  strict() { return { ok: true }; }

  @Get("plain")
  plain() { return { ok: true }; }
}

async function makeApp(env: { RATE_LIMIT_PEER_MULTIPLIER?: string }): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot(appThrottlers(env))],
    controllers: [TController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication();
  // One trusted proxy hop, as in production: the load balancer appends the address it actually saw to X-Forwarded-For.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", 1);
  await app.init();
  return app;
}

jest.setTimeout(60_000); // the first test also pays for compiling the Nest testing module

// What the load balancer produces for a direct hit: whatever the client sent, then the client's real address.
const viaLb = (forged: string, real = "198.51.100.9") => `${forged}, ${real}`;

describe("peerMultiplier / peerLimit", () => {
  it("defaults to 10 and ignores junk", () => {
    expect(peerMultiplier(undefined)).toBe(10);
    expect(peerMultiplier("")).toBe(10);
    expect(peerMultiplier("abc")).toBe(10);
    expect(peerMultiplier("0")).toBe(10);
    expect(peerMultiplier("5000")).toBe(10);
    expect(peerMultiplier("3")).toBe(3);
  });

  it("scales the route's own limit, falling back to the global 100", () => {
    const ctx = (handlerLimit?: number, classLimit?: number) => {
      const handler = () => undefined, cls = class {};
      if (handlerLimit !== undefined) Reflect.defineMetadata("THROTTLER:LIMITdefault", handlerLimit, handler);
      if (classLimit !== undefined) Reflect.defineMetadata("THROTTLER:LIMITdefault", classLimit, cls);
      return { getHandler: () => handler, getClass: () => cls };
    };
    expect(peerLimit(ctx(), 10)).toBe(1000);
    expect(peerLimit(ctx(5), 10)).toBe(50);
    expect(peerLimit(ctx(undefined, 20), 10)).toBe(200);
    expect(peerLimit(ctx(5, 20), 2)).toBe(10);
  });
});

describe("rate limiting with forged X-Forwarded-For", () => {
  let app: INestApplication;
  afterEach(async () => { await app.close(); });

  it("still limits one visitor by the (first) forwarded address", async () => {
    app = await makeApp({});
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await request(app.getHttpServer()).get("/t/strict").set("X-Forwarded-For", viaLb("203.0.113.7"))).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
  });

  it("different visitors behind a shared proxy keep separate budgets", async () => {
    app = await makeApp({});
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).get("/t/strict").set("X-Forwarded-For", viaLb("203.0.113.7"));
    const other = await request(app.getHttpServer()).get("/t/strict").set("X-Forwarded-For", viaLb("203.0.113.8"));
    expect(other.status).toBe(200);
  });

  it("does NOT let a client escape by rotating the forged header: the real address hits its own cap", async () => {
    app = await makeApp({ RATE_LIMIT_PEER_MULTIPLIER: "2" }); // strict route: 5 per visitor, 10 per real address
    const codes: number[] = [];
    for (let i = 0; i < 13; i++) codes.push((await request(app.getHttpServer()).get("/t/strict").set("X-Forwarded-For", viaLb(`203.0.113.${100 + i}`))).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429, 429]);
  });

  it("a different real address is unaffected by someone else's flood", async () => {
    app = await makeApp({ RATE_LIMIT_PEER_MULTIPLIER: "2" });
    for (let i = 0; i < 12; i++) await request(app.getHttpServer()).get("/t/strict").set("X-Forwarded-For", viaLb(`203.0.113.${100 + i}`));
    const innocent = await request(app.getHttpServer()).get("/t/strict").set("X-Forwarded-For", viaLb("203.0.113.7", "198.51.100.77"));
    expect(innocent.status).toBe(200);
  });

  it("routes without their own limit get the global per-visitor limit × multiplier", async () => {
    app = await makeApp({ RATE_LIMIT_PEER_MULTIPLIER: "1" }); // same cap as the per-visitor bucket: 100
    let last = 0;
    for (let i = 0; i < 101; i++) last = (await request(app.getHttpServer()).get("/t/plain").set("X-Forwarded-For", viaLb(`203.0.113.${i % 250}`, "198.51.100.5"))).status;
    expect(last).toBe(429);
  });
});
