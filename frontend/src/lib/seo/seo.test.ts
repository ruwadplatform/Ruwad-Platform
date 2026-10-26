import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { profileDescription, profileJsonLd, profileTitle } from "./profile-seo.ts";
import { INDEXABLE_ROUTES, PRIVATE_ROUTES, PROFILE_SECTIONS, ROBOTS_DISALLOW, SITEMAP_STATIC } from "./routes.ts";
import { buildRobots, buildSitemap, describe, jsonLdString, truncate } from "./rules.ts";
import { SITE_URL, absoluteUrl, indexingAllowed } from "./site.ts";

const PROD = { VERCEL_ENV: "production" };

test("the canonical address is the www production host", () => {
  assert.equal(SITE_URL, "https://www.ruwad.studio");
  assert.equal(absoluteUrl("/"), "https://www.ruwad.studio");
  assert.equal(absoluteUrl("/startups"), "https://www.ruwad.studio/startups");
});

test("only the real production deployment may be indexed", () => {
  assert.equal(indexingAllowed({ VERCEL_ENV: "production" }), true);
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, {}, { NODE_ENV: "production" }]) assert.equal(indexingAllowed(env), false);
  assert.equal(indexingAllowed({ SEO_FORCE_INDEXING: "true" }), true);
});

test("robots.txt: production opens the public site and closes the private areas, with the sitemap", () => {
  const r = buildRobots(PROD, "www.ruwad.studio");
  assert.equal(r.sitemap, "https://www.ruwad.studio/sitemap.xml");
  assert.deepEqual(r.rules[0]!.allow, "/");
  for (const p of ["/api/", "/admin/", "/workspace/", "/my-ndas", "/settings", "/profile", "/report-review/", "/search"]) assert.ok((r.rules[0]!.disallow as string[]).includes(p), p);
});

test("robots.txt: previews and local builds are closed completely", () => {
  for (const [env, host] of [[{ VERCEL_ENV: "preview" }, "ruwad-git-x.vercel.app"], [{}, "localhost:5174"]] as const) {
    const r = buildRobots(env, host);
    assert.deepEqual(r.rules, [{ userAgent: "*", disallow: "/" }], host);
    assert.equal(r.sitemap, undefined);
  }
});

test("robots.txt: the production deployment on another address stays crawlable (so its noindex header can be seen) and has no sitemap", () => {
  for (const host of ["ruwad-platform.vercel.app", "ruwad.studio"]) {
    const r = buildRobots(PROD, host);
    assert.deepEqual(r.rules, [{ userAgent: "*", allow: "/" }], host);
    assert.equal(r.sitemap, undefined);
  }
});

test("the sitemap lists the public pages and profiles, once each, on the canonical host", () => {
  const entries = buildSitemap({
    startups: [{ slug: "allergenix", updated: "2026-10-07" }, { slug: "allergenix" }, { slug: "has space" }, { slug: "" }, { slug: "a/b" }],
    investors: [{ slug: "sanabil" }],
    hubs: [], research: [{ slug: "kaust", updated: "not a date" }], multinationals: [{ slug: "pfizer" }],
  }, [], new Date("2026-11-01T00:00:00Z"));
  const urls = entries.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
  assert.ok(urls.every((u) => u.startsWith("https://www.ruwad.studio")));
  for (const u of ["https://www.ruwad.studio", "https://www.ruwad.studio/startups", "https://www.ruwad.studio/startups/allergenix", "https://www.ruwad.studio/investors/sanabil", "https://www.ruwad.studio/research/kaust", "https://www.ruwad.studio/multinationals/pfizer"]) assert.ok(urls.includes(u), u);
  assert.equal(urls.filter((u) => u.includes("/startups/")).length, 1, "unusable slugs are skipped");
  assert.equal(entries.find((e) => e.url.endsWith("/startups/allergenix"))!.lastModified!.toISOString().slice(0, 10), "2026-10-07");
  assert.equal(entries.find((e) => e.url.endsWith("/research/kaust"))!.lastModified!.toISOString().slice(0, 10), "2026-11-01", "an invalid date falls back");
});

test("nothing private is ever in the sitemap", () => {
  const urls = buildSitemap({ startups: [{ slug: "x" }] }).map((e) => new URL(e.url).pathname);
  for (const p of urls) for (const priv of PRIVATE_ROUTES) assert.ok(!(p === `/${priv}` || p.startsWith(`/${priv}/`)), `${p} is under private route ${priv}`);
  for (const s of SITEMAP_STATIC) assert.ok(INDEXABLE_ROUTES.includes(s.path.split("/")[1] ?? ""), s.path);
  for (const s of PROFILE_SECTIONS) assert.ok(INDEXABLE_ROUTES.includes(s), s);
  // and nothing in robots.txt blocks a page that is in the sitemap
  for (const p of urls) for (const d of ROBOTS_DISALLOW) assert.ok(!p.startsWith(d.replace(/\/$/, "")) || p === "/", `${p} is blocked by ${d}`);
});

test("every top-level route in src/app is classified as indexable or private", () => {
  const dir = new URL("../../app/(app)/", import.meta.url);
  const top = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const outside = readdirSync(new URL("../../app/", import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("(")).map((d) => d.name);
  const known = new Set([...INDEXABLE_ROUTES, ...PRIVATE_ROUTES]);
  const unknown = [...top, ...outside].filter((n) => !known.has(n));
  assert.deepEqual(unknown, [], `decide whether these routes are public or private in lib/seo/routes.ts: ${unknown.join(", ")}`);
});

test("every private route in src/app has its own noindex layout", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  for (const r of PRIVATE_ROUTES.filter((x) => x !== "api")) {
    const inGroup = new URL(`../../app/(app)/${r}/layout.tsx`, import.meta.url);
    const top = new URL(`../../app/${r}/layout.tsx`, import.meta.url);
    const file = existsSync(inGroup) ? inGroup : existsSync(top) ? top : null;
    if (!file) { assert.ok(["report-review"].includes(r), `${r} has no layout`); continue; }
    assert.match(readFileSync(file, "utf8"), /privateMetadata\(/, r);
  }
});

test("text helpers", () => {
  assert.equal(truncate("  a   b \n c "), "a b c");
  const long = "word ".repeat(80);
  const t = truncate(long, 100);
  assert.ok(t.length <= 100 && t.endsWith("…") && !t.includes("  "));
  assert.equal(describe("", "short", "A usable description that is long enough."), "A usable description that is long enough.");
  assert.equal(describe(null, undefined), "");
});

test("structured data can't break out of its script tag", () => {
  const s = jsonLdString({ name: "</script><script>alert(1)</script>" });
  assert.ok(!s.includes("</script>") && !s.includes("<"));
  assert.equal(JSON.parse(s).name, "</script><script>alert(1)</script>");
});

const facts = { section: "startups" as const, slug: "allergenix", name: "ALLERGENIX", kind: "Biotechnology", city: "Riyadh", country: "Saudi Arabia", founded: 2025, text: ["Personalized oral immunotherapy, tailored to each patient's biology", "A longer description."], updated: "2026-10-07" };

test("profile titles and descriptions are specific and bounded", () => {
  assert.equal(profileTitle(facts), "ALLERGENIX — Biotechnology startup in Riyadh");
  const d = profileDescription(facts);
  assert.ok(d.length <= 158 && d.includes("ALLERGENIX") && d.includes("RUWĀD"), d);
  assert.equal(profileTitle({ ...facts, section: "hubs", kind: "Accelerator", name: "Hub71" }), "Hub71 — Accelerator in Riyadh");
  assert.equal(profileTitle({ ...facts, kind: null, city: null, country: null }), "ALLERGENIX — healthcare startup");
});

test("profile structured data states only public facts and never contact, score, funding or team details", () => {
  const ld = profileJsonLd({ ...facts, ...({ email: "x@y.z", phone: "+966", ruwadScore: 4.3, fundingTotal: 7.5, team: ["A"] } as object) }) as Record<string, unknown> & { mainEntity: Record<string, unknown> };
  assert.equal(ld["@type"], "ProfilePage");
  assert.equal(ld.url, "https://www.ruwad.studio/startups/allergenix");
  assert.equal(ld.mainEntity["@type"], "Organization");
  assert.equal(ld.mainEntity.foundingDate, "2025");
  assert.deepEqual(ld.mainEntity.address, { "@type": "PostalAddress", addressLocality: "Riyadh", addressCountry: "Saudi Arabia" });
  const json = JSON.stringify(ld);
  for (const secret of ["x@y.z", "+966", "4.3", "7.5", "ruwadScore", "fundingTotal", "email", "phone", "team", "sameAs"]) assert.ok(!json.includes(secret), secret);
  assert.equal(ld.dateModified, "2026-10-07T00:00:00.000Z");
});
