import * as dns from "dns";
import * as http from "http";
import { AddressInfo } from "net";
import { fetchDocument, fetchHtml, isPrivateAddress } from "./safe-fetch";

jest.mock("dns", () => ({ ...jest.requireActual("dns"), lookup: jest.fn() }));

/** A real local server plus a stubbed DNS, so the guarded lookup (the part that decides which address is connected to) is exercised for real. */
describe("safe-fetch", () => {
  let server: http.Server;
  let port: number;
  const routes: Record<string, (res: http.ServerResponse) => void> = {
    "/page": (res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<html><title>ok</title><body>hello</body></html>"); },
    "/json": (res) => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"a":1}'); },
    "/text": (res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("plain"); },
    "/missing": (res) => { res.writeHead(404); res.end("nope"); },
    "/redirect": (res) => { res.writeHead(302, { location: "/page" }); res.end(); },
    "/redirect-private": (res) => { res.writeHead(302, { location: "http://internal.test:%PORT%/page".replace("%PORT%", String(port)) }); res.end(); },
  };
  const lookupCalls: { host: string; family?: number | string }[] = [];
  const onLookup: Record<string, () => void> = {};
  let served = 0;
  const dnsMap: Record<string, { v4?: string[]; v6?: string[] }> = {};
  const realLookup = jest.requireActual("dns").lookup;

  beforeAll(async () => {
    // Connection: close keeps Node's keep-alive agent from reusing a socket that an earlier test already validated.
    server = http.createServer((req, res) => (served++, res.setHeader("connection", "close"), routes[req.url ?? ""] ?? ((r) => { r.writeHead(404); r.end(); }))(res));
    await new Promise<void>((r) => server.listen(0, "::", r)); // dual-stack: answers both 127.0.0.1 and ::1
    port = (server.address() as AddressInfo).port;
    (dns.lookup as unknown as jest.Mock).mockImplementation((host: string, opts: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
      lookupCalls.push({ host, family: opts.family });
      onLookup[host]?.();
      const entry = dnsMap[host];
      if (!entry) return (realLookup as unknown as (...a: unknown[]) => void)(host, opts, cb);
      const v4 = (entry.v4 ?? []).map((address) => ({ address, family: 4 }));
      const v6 = (entry.v6 ?? []).map((address) => ({ address, family: 6 }));
      const out = opts.family === 4 ? v4 : [...v6, ...v4]; // an unconstrained lookup lists IPv6 first, like the affected network
      if (!out.length) return cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
      return cb(null, out);
    });
  });
  afterAll(async () => { await new Promise((r) => server.close(r)); });
  beforeEach(() => { lookupCalls.length = 0; process.env.CONTENT_ALLOW_PRIVATE_FETCH = "true"; delete dnsMap["site.test"]; });
  afterEach(() => { delete process.env.CONTENT_ALLOW_PRIVATE_FETCH; });

  const url = (path: string, host = "site.test") => `http://${host}:${port}${path}`;

  it("connects over IPv4 when a host lists an unreachable IPv6 address first", async () => {
    dnsMap["site.test"] = { v4: ["127.0.0.1"], v6: ["2001:db8::1"] }; // a documentation-range IPv6 address that never answers, so an IPv6-first connect would hang
    const res = await fetchDocument(url("/page"));
    expect(res.ok).toBe(true);
    expect(lookupCalls[0]).toEqual({ host: "site.test", family: 4 });
  });

  it("still works for a host that only has IPv6 or resolves only without a family", async () => {
    dnsMap["site.test"] = { v6: ["::1"] };
    const res = await fetchDocument(url("/page"));
    expect(res.ok).toBe(true);
    expect(lookupCalls.map((c) => c.family)).toEqual([4, undefined]);
  });

  it("fetchHtml returns HTML pages and null for anything else", async () => {
    dnsMap["site.test"] = { v4: ["127.0.0.1"] };
    expect((await fetchHtml(url("/page")))?.html).toContain("hello");
    expect(await fetchHtml(url("/text"))).toBeNull();
    expect(await fetchHtml(url("/missing"))).toBeNull();
  });

  it("follows a redirect and reports HTTP errors and non-HTML documents", async () => {
    dnsMap["site.test"] = { v4: ["127.0.0.1"] };
    const redirected = await fetchDocument(url("/redirect"));
    expect(redirected.ok && redirected.body.toString()).toContain("hello");
    expect(await fetchDocument(url("/missing"))).toEqual({ ok: false, reason: "http", status: 404 });
    const json = await fetchDocument(url("/json"));
    expect(json.ok && json.contentType).toContain("json");
  });

  describe("private and internal addresses stay blocked (production behaviour)", () => {
    beforeEach(() => { delete process.env.CONTENT_ALLOW_PRIVATE_FETCH; });

    it.each([["loopback", "127.0.0.1"], ["private 10.x", "10.0.0.5"], ["link-local metadata", "169.254.169.254"], ["private 192.168", "192.168.1.10"]])("refuses a host that resolves to %s", async (_n, ip) => {
      dnsMap["site.test"] = { v4: [ip] };
      expect(await fetchDocument(url("/page"))).toEqual({ ok: false, reason: "unreachable" });
      expect(await fetchHtml(url("/page"))).toBeNull();
    });

    it("refuses a host whose only addresses are private IPv6", async () => {
      dnsMap["site.test"] = { v6: ["::1", "fd00::1"] };
      expect(await fetchDocument(url("/page"))).toEqual({ ok: false, reason: "unreachable" });
    });

    it("refuses literal private IPs and non-http schemes", async () => {
      expect(await fetchDocument(`http://127.0.0.1:${port}/page`)).toEqual({ ok: false, reason: "unreachable" });
      expect(await fetchDocument("file:///etc/passwd")).toEqual({ ok: false, reason: "unreachable" });
      expect(await fetchHtml("ftp://example.com/x")).toBeNull();
    });

    it("refuses a redirect into an internal host", async () => {
      process.env.CONTENT_ALLOW_PRIVATE_FETCH = "true"; // lets the test server (loopback) answer the first hop only
      dnsMap["site.test"] = { v4: ["127.0.0.1"] };
      dnsMap["internal.test"] = { v4: ["10.1.2.3"] };
      onLookup["internal.test"] = () => { delete process.env.CONTENT_ALLOW_PRIVATE_FETCH; }; // from the second hop on, production rules apply
      served = 0;
      expect(await fetchDocument(url("/redirect-private"))).toEqual({ ok: false, reason: "unreachable" });
      expect(served).toBe(1);
      delete onLookup["internal.test"];
    });

    it("only honours the private-address switch outside production", async () => {
      dnsMap["site.test"] = { v4: ["127.0.0.1"] };
      process.env.CONTENT_ALLOW_PRIVATE_FETCH = "true";
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try { expect(await fetchDocument(url("/page"))).toEqual({ ok: false, reason: "unreachable" }); }
      finally { process.env.NODE_ENV = prev; }
    });
  });

  it("classifies private and public addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "134.239.12.134", "2a02:df1:14:4:1::1"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});
