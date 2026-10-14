import { BadRequestException } from "@nestjs/common";
import { RejectNulBytesPipe, rejectMalformedUrls, resolveTrustProxyHops } from "./request-hygiene";

describe("RejectNulBytesPipe", () => {
  const pipe = new RejectNulBytesPipe();
  it("lets normal values through untouched, including unicode and nested data", () => {
    const v = { name: "مرحبا 😀", list: ["a", { b: "c" }], n: 5, ok: true, none: null };
    expect(pipe.transform(v)).toBe(v);
    expect(pipe.transform("plain")).toBe("plain");
    expect(pipe.transform(undefined)).toBeUndefined();
  });
  it("rejects a NUL byte anywhere: top level, nested, in arrays, or in a key", () => {
    expect(() => pipe.transform("a\u0000b")).toThrow(BadRequestException);
    expect(() => pipe.transform({ a: { b: ["x", "y\u0000"] } })).toThrow(BadRequestException);
    expect(() => pipe.transform({ ["k\u0000"]: 1 })).toThrow(BadRequestException);
  });
});

describe("rejectMalformedUrls", () => {
  const run = (url: string) => {
    let status = 0; let body: unknown; let called = false;
    const res = { status: (s: number) => { status = s; return { json: (b: unknown) => { body = b; } }; } } as never;
    rejectMalformedUrls({ url } as never, res, () => { called = true; });
    return { status, body, called };
  };
  it("passes a normal URL on to routing", () => {
    expect(run("/api/startups?search=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7&page=2").called).toBe(true);
  });
  it("answers 400 to truncated percent-encoding and to an encoded NUL, without routing", () => {
    for (const url of ["/api/investors/%E0%A4%A", "/api/startups?search=%00", "/api/startups/%"]) {
      const r = run(url);
      expect(r.called).toBe(false);
      expect(r.status).toBe(400);
    }
  });
});

describe("resolveTrustProxyHops", () => {
  it("trusts exactly one proxy hop in production (Render's load balancer) and none elsewhere", () => {
    expect(resolveTrustProxyHops({ NODE_ENV: "production" })).toBe(1);
    expect(resolveTrustProxyHops({ NODE_ENV: "development" })).toBe(0);
    expect(resolveTrustProxyHops({})).toBe(0);
  });
  it("can be overridden, and ignores nonsense", () => {
    expect(resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "2" })).toBe(2);
    expect(resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "0" })).toBe(0);
    expect(resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "banana" })).toBe(0);
    expect(resolveTrustProxyHops({ NODE_ENV: "production", TRUST_PROXY_HOPS: "99" })).toBe(0);
  });
});
