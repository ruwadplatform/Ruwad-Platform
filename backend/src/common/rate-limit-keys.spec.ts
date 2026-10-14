import { accountKey, resolveClientIp } from "./rate-limit-keys";

describe("resolveClientIp", () => {
  it("uses the first valid address in X-Forwarded-For (the visitor, not a shared proxy)", () => {
    expect(resolveClientIp({ headers: { "x-forwarded-for": "203.0.113.7, 76.76.21.21, 10.0.0.2" }, ip: "10.0.0.2" })).toBe("203.0.113.7");
  });

  it("supports IPv6 addresses", () => {
    expect(resolveClientIp({ headers: { "x-forwarded-for": "2001:db8::1, 10.0.0.2" }, ip: "10.0.0.2" })).toBe("2001:db8::1");
  });

  it("skips junk entries and falls back to the socket address", () => {
    expect(resolveClientIp({ headers: { "x-forwarded-for": "not-an-ip, 198.51.100.4" }, ip: "10.0.0.2" })).toBe("198.51.100.4");
    expect(resolveClientIp({ headers: { "x-forwarded-for": "garbage" }, ip: "10.0.0.2" })).toBe("10.0.0.2");
    expect(resolveClientIp({ headers: {}, ip: "10.0.0.2" })).toBe("10.0.0.2");
    expect(resolveClientIp({})).toBe("unknown");
  });

  it("gives different visitors different buckets", () => {
    const a = resolveClientIp({ headers: { "x-forwarded-for": "203.0.113.7" }, ip: "10.0.0.2" });
    const b = resolveClientIp({ headers: { "x-forwarded-for": "203.0.113.8" }, ip: "10.0.0.2" });
    expect(a).not.toBe(b);
  });
});

describe("accountKey", () => {
  const login = (email: unknown, extra: Record<string, unknown> = {}) => ({ method: "POST", path: "/api/auth/login", body: { email }, ...extra });

  it("keys login, register and forgot-password by normalised email", () => {
    expect(accountKey(login("  Person@Example.COM "))).toBe("acct:person@example.com");
    expect(accountKey({ method: "POST", path: "/api/auth/register", body: { email: "a@b.co" } })).toBe("acct:a@b.co");
    expect(accountKey({ method: "POST", path: "/api/auth/forgot-password", body: { email: "a@b.co" } })).toBe("acct:a@b.co");
  });

  it("is the same key whatever the IP header says (cannot be dodged by forging it)", () => {
    expect(accountKey(login("a@b.co", { headers: { "x-forwarded-for": "1.1.1.1" } }))).toBe(accountKey(login("a@b.co", { headers: { "x-forwarded-for": "2.2.2.2" } })));
  });

  it("ignores other routes, methods and bodies without an email", () => {
    expect(accountKey({ method: "GET", path: "/api/auth/login", body: { email: "a@b.co" } })).toBeNull();
    expect(accountKey({ method: "POST", path: "/api/auth/reset-password", body: { email: "a@b.co" } })).toBeNull();
    expect(accountKey({ method: "POST", path: "/api/startups", body: { email: "a@b.co" } })).toBeNull();
    expect(accountKey(login(undefined))).toBeNull();
    expect(accountKey(login(42))).toBeNull();
    expect(accountKey(login("   "))).toBeNull();
    expect(accountKey({ method: "POST", path: "/api/auth/login" })).toBeNull();
  });
});
