/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { getDataSourceToken, TypeOrmModule } from "@nestjs/typeorm";
import cookieParser from "cookie-parser";
import request from "supertest";
import { JwtStrategy } from "../auth/jwt.strategy";
import { AnalyticsModule } from "../analytics/analytics.module";
import { HubsModule } from "../hubs/hubs.module";
import { InvestorsModule } from "../investors/investors.module";
import { MultinationalsModule } from "../multinationals/multinationals.module";
import { ReportsModule } from "../reports/reports.module";
import { ResearchModule } from "../research/research.module";
import { StartupsModule } from "../startups/startups.module";
import { Hub } from "../hubs/hub.entity";
import { Investor } from "../investors/investor.entity";
import { Multinational } from "../multinationals/multinational.entity";
import { Report } from "../reports/report.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { Startup } from "../startups/startup.entity";

const { assertLocalDatabase, LOCAL_DATABASE_URL } = require("../../scripts/dev/local-db-guard");
const { Client } = require("pg");

/** INTEGRATION TESTS for server-side field-level access control, against the LOCAL embedded Postgres (npm run test:visibility). Skipped unless VISIBILITY_INTEGRATION=1,
 * and refuses any database that is not on this machine. It creates its own records, every restricted value of which contains the marker `SEC<tag>`, so "nothing restricted
 * leaked" is one substring check on the whole response; it deletes every row it created. */
const RUN = process.env.VISIBILITY_INTEGRATION === "1";
const suite = RUN ? describe : describe.skip;

const SECRET = "visibility-integration-test-secret-not-a-real-one";
const tag = randomUUID().slice(0, 8);
const SEC = `SEC${tag}`;
const slug = (n: string) => `vis-${tag}-${n}`;
const today = new Date().toISOString().slice(0, 10);

suite("field-level access control (local Postgres)", () => {
  let app: INestApplication;
  let db: InstanceType<typeof Client>;
  let jwt: JwtService;
  const created: Record<string, string[]> = {};
  const track = (table: string, id: string) => { (created[table] ??= []).push(id); return id; };
  const tokenOf = new Map<string, string>();
  const ids: Record<string, string> = {};

  const as = (who: string | null, r: request.Test) => (who === "garbage" ? r.set("Cookie", "ruwad_token=not.a.jwt") : who ? r.set("Cookie", `ruwad_token=${tokenOf.get(who)}`) : r);
  const get = (who: string | null, p: string) => as(who, request(app.getHttpServer()).get(`/api${p}`));
  const json = (b: unknown) => JSON.stringify(b);

  async function user(name: string, role: string) {
    const email = `vis-${tag}-${name}@example.test`;
    const { rows } = await db.query(`INSERT INTO users ("firstName","lastName",email,"passwordHash",role) VALUES ($1,$2,$3,$4,$5) RETURNING id`, ["IT", name, email, "x", role]);
    track("users", rows[0].id);
    ids[name] = rows[0].id;
    tokenOf.set(name, jwt.sign({ sub: rows[0].id, email, role }));
  }

  const startupRow = (n: string, over: Record<string, unknown> = {}) => ({
    slug: slug(n), name: `VisCo ${n} ${tag}`, category: "Digital Health", subsector: "x", tagline: `tagline ${n}`, country: "Saudi Arabia", city: "Riyadh", hq: "Riyadh", founded: 2020,
    stage: "Seed", businessModel: "B2B", employees: 12, fundingTotal: 10, valuation: 20, desc: `public description ${n}`, problem: "p", solution: "s", advantage: "a", sfda: "Approved",
    fda: "No", ce: "No", clinicalStatus: "None", patentStatus: "None", marketTam: "1B", marketSam: "1B", marketSom: "1B", legalName: `VisCo ${n} LLC`, website: `https://vis-${n}.example.test`,
    email: `public-${n}@example.test`, phone: "+9660000", linkedin: "https://linkedin.com/company/x", registrationNumber: `CR-${n}`, provenanceLastUpdated: today, ruwadScore: 5, scoreStatus: "CALCULATED", ...over,
  });

  beforeAll(async () => {
    db = new Client({ connectionString: assertLocalDatabase(LOCAL_DATABASE_URL) });
    await db.connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET, NODE_ENV: "test" })] }),
        TypeOrmModule.forRoot({ type: "postgres", url: assertLocalDatabase(LOCAL_DATABASE_URL), ssl: false, autoLoadEntities: true, synchronize: false }),
        PassportModule,
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: "1h" } }),
        StartupsModule, InvestorsModule, HubsModule, ResearchModule, MultinationalsModule, ReportsModule, AnalyticsModule,
      ],
      providers: [JwtStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser()); // as in main.ts: the session is read from the httpOnly cookie
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
    const ds = moduleRef.get(getDataSourceToken());

    for (const [name, role] of [["member", "USER"], ["owner", "FOUNDER"], ["other", "FOUNDER"], ["admin", "RUWAD_ADMIN"]] as const) await user(name, role);

    // Five startups. "main" carries every restricted value; its funding is the HIGHEST while its score is the LOWEST, so a funding sort is distinguishable from the default order.
    const startups = (ds.getRepository(Startup) as any);
    const main = await startups.save(startups.create(startupRow("main", {
      fundingTotal: 123.45, valuation: 987.65, ruwadScore: 1, email: `ceo-${SEC}@vis.test`, phone: `+966${SEC}`, registrationNumber: `CR-${SEC}`, targetRaise: `RAISE-${SEC}`, fundraising: true,
      fda: `FDA-${SEC}`, ce: `CE-${SEC}`, clinicalStatus: `CLIN-${SEC}`, patentStatus: `PAT-${SEC}`, marketTam: `TAM-${SEC}`, marketSam: `SAM-${SEC}`, marketSom: `SOM-${SEC}`,
      marketCompetitors: [`COMP-${SEC}`], traction: { revenue: `REV-${SEC}`, growth: "1", customers: 1, users: 1, partnerships: 1, pilots: 1, markets: "KSA", awards: "-" },
      scoreConfidence: 0.77, scoreVersion: `VER-${SEC}`,
    }) as never));
    ids.main = track("startups", main.id);
    const others: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const s = await startups.save(startups.create(startupRow(`p${i}`, { fundingTotal: 10 + i, ruwadScore: 5 + i }) as never));
      others.push(track("startups", s.id));
    }
    await db.query(`INSERT INTO funding_rounds ("startupId", round, date, amount, lead) VALUES ($1,'Seed','2025-01',77.77,$2)`, [ids.main, `LEAD-${SEC}`]);
    await db.query(`INSERT INTO team_members ("entityType","entityId",name,title,"isFounder","experienceYears","healthcareExperienceYears") VALUES ('STARTUP',$1,'Sara Test','CEO',true,91,92)`, [ids.main]);
    await db.query(`INSERT INTO contacts ("entityType","entityId","mainContact",email,phone,website,linkedin) VALUES ('STARTUP',$1,$2,$3,$4,'https://vis-main.example.test','https://linkedin.com/company/vis')`,
      [ids.main, `PERSON-${SEC}`, `contact-${SEC}@vis.test`, `+966c${SEC}`]);
    await db.query(`INSERT INTO entity_memberships ("userId", kind, "entityId", role) VALUES ($1,'STARTUP',$2,'OWNER'), ($3,'STARTUP',$4,'OWNER')`, [ids.owner, ids.main, ids.other, others[0]]);

    const investor = await (ds.getRepository(Investor) as any).save((ds.getRepository(Investor) as any).create({
      slug: slug("investor"), name: `Vis Capital ${tag}`, short: "VC", type: "VC", city: "Riyadh", founded: 2015, desc: "public investor description", thesis: "public thesis", ticket: "1-3M", aum: "100M",
      available: "yes", investments: 9, exits: 1, hcDeals: 4, provenanceLastUpdated: today, recentDeals: [{ startup: `DEAL-${SEC}`, round: "A", date: "2025-01" }],
    } as never));
    ids.investor = track("investors", investor.id);
    for (const sid of [ids.main, ...others]) await db.query(`INSERT INTO investments ("investorId","targetEntityType","targetEntityId",round,year) VALUES ($1,'STARTUP',$2,$3,2024)`, [ids.investor, sid, `ROUND-${SEC}`]);

    const contactSql = `INSERT INTO contacts ("entityType","entityId","mainContact",email,phone,website,linkedin) VALUES ($1,$2,$3,$4,$5,'https://x.example.test','https://linkedin.com/company/x')`;
    const hub = await (ds.getRepository(Hub) as any).save((ds.getRepository(Hub) as any).create({
      slug: slug("hub"), name: `Vis Hub ${tag}`, type: "Accelerator", city: "Riyadh", country: "Saudi Arabia", founded: 2019, website: "https://hub.example.test", operatingRegion: "KSA",
      ownershipType: "Private", deadline: "-", desc: "public hub description", about: "about", fundingAvailable: "yes", fundingType: "grant", provenanceLastUpdated: today,
    } as never));
    ids.hub = track("hubs", hub.id);
    await db.query(contactSql, ["HUB", ids.hub, `PERSON-${SEC}`, `hub-${SEC}@vis.test`, `+966h${SEC}`]);

    const research = await (ds.getRepository(ResearchInstitution) as any).save((ds.getRepository(ResearchInstitution) as any).create({
      slug: slug("research"), name: `Vis Institute ${tag}`, type: "University", city: "Riyadh", country: "Saudi Arabia", founded: 1990, website: "https://r.example.test", numResearchers: 10, numCenters: 1,
      numLabs: 1, about: "public research description", technologyReadinessLevel: 4, patentsCount: 2, provenanceLastUpdated: today,
      contacts: { mainContact: `PERSON-${SEC}`, researchOffice: "x", techTransferOffice: "x", industryPartnershipOffice: "x", website: "w", email: `r-${SEC}@vis.test`, phone: `+966r${SEC}`, linkedin: "l", location: "Riyadh" },
    } as never));
    ids.research = track("research_institutions", research.id);
    await db.query(contactSql, ["RESEARCH", ids.research, `PERSON-${SEC}`, `rc-${SEC}@vis.test`, `+966q${SEC}`]);

    const mnc = await (ds.getRepository(Multinational) as any).save((ds.getRepository(Multinational) as any).create({
      slug: slug("mnc"), name: `Vis Global ${tag}`, category: "Pharma", subsector: "x", tagline: "t", country: "US", city: "NY", hq: "NY", founded: 1950, businessModel: "B2B", employees: 1000, companySize: "Large",
      desc: "public mnc description", problem: "p", solution: "s", advantage: "a", sfda: "Approved", fda: "Approved", ce: "Approved", clinicalStatus: "x", patentStatus: "x", marketTam: "1", marketSam: "1",
      marketSom: "1", regionalEmployees: "10", rdFocus: "x", rdCenters: 2, legalName: "Vis Global Inc", website: "https://m.example.test", email: `mnc-${SEC}@vis.test`, phone: `+966m${SEC}`,
      linkedin: "https://linkedin.com/company/m", provenanceLastUpdated: today, investmentsList: [{ company: `INV-${SEC}`, sector: "x", round: "A", year: 2024 }],
    } as never));
    ids.mnc = track("multinationals", mnc.id);
    await db.query(contactSql, ["MULTINATIONAL", ids.mnc, `PERSON-${SEC}`, `mc-${SEC}@vis.test`, `+966n${SEC}`]);

    const reports = (ds.getRepository(Report) as any);
    const baseReport = (n: string, over: Record<string, unknown>) => reports.create({
      slug: slug(n), title: `Vis Report ${n} ${tag}`, category: "Market", reportType: "Analysis", publicationDate: today, description: `public description ${n}`, geography: "KSA", sector: "Digital Health",
      readingTime: "5 min", pages: 5, executiveSummary: "public overview of the report", isPublished: true, ...over,
    } as never);
    const legacy = await reports.save(baseReport("legacy", {
      executiveSummary: `SUMMARY-${SEC}`,
      keyFindings: ["finding one", "finding two", `FINDING3-${SEC}`, `FINDING4-${SEC}`], marketStats: [{ label: "Stat", value: "1" }],
      sections: [{ heading: "H1", body: `BODY1-${SEC}`, chart: [{ l: "a", v: 1 }] }, { heading: "H2", body: `BODY2-${SEC}`, chart: [{ l: `CHART2-${SEC}`, v: 2 }] }, { heading: "H3", body: `BODY3-${SEC}` }],
    }));
    ids.legacy = track("reports", legacy.id);
    const generated = await reports.save(baseReport("generated", {
      reportKind: "SECTOR_OVERVIEW", scope: { sector: `SCOPE-${SEC}` }, generationMode: `MODE-${SEC}`, submissionId: randomUUID(), researchQueries: [{ q: `QUERY-${SEC}` }],
      generated: { overviewLines: ["Public overview line."], methodology: ["m"], coverageNotice: "n", scopeLabel: "Digital Health", research: { status: "ok", searchesUsed: 41, cacheHits: 42, sourcesKept: 43 } },
      internalStats: {
        coverage: { startups: 5, investors: 1, asOf: today }, metrics: [{ label: "Startups on RUWĀD", value: "5" }],
        distributions: [{ key: "fundingByCompany", title: "t", unit: "SAR M", rows: [{ l: `CO-${SEC}`, v: 555.55 }] }, { key: "startupsByStage", title: "t", unit: "n", rows: [{ l: "Seed", v: 5 }] }],
        companies: [{ slug: "z", name: "Zed", stage: "Seed", city: "Riyadh", category: "x", fundingTotal: 999.99 }, { slug: "a", name: "Alpha", stage: "Seed", city: "Riyadh", category: "x", fundingTotal: 1.11 }],
        investors: [],
      },
      externalSources: [{ id: "e1", title: "Source", url: "https://example.test", domain: "example.test", snippet: "s", publishedAt: null, publishedText: null, query: `SEARCH-${SEC}`, topic: "news", sourceType: "NEWS", sourceTypeLabel: "News", tier: 3, retrievedAt: today }],
      relatedStartupIds: [ids.main], relatedInvestorIds: [ids.investor],
    }));
    ids.generated = track("reports", generated.id);
    const draft = await reports.save(baseReport("draft", { isPublished: false }));
    ids.draft = track("reports", draft.id);
  }, 120_000);

  afterAll(async () => {
    const order = ["reports", "startups", "investors", "hubs", "research_institutions", "multinationals"];
    const mine = (t: string) => created[t] ?? [];
    await db.query(`DELETE FROM investments WHERE "investorId" = ANY($1)`, [mine("investors")]);
    await db.query(`DELETE FROM funding_rounds WHERE "startupId" = ANY($1)`, [mine("startups")]);
    const entityIds = [...mine("startups"), ...mine("investors"), ...mine("hubs"), ...mine("research_institutions"), ...mine("multinationals")];
    await db.query(`DELETE FROM team_members WHERE "entityId" = ANY($1)`, [entityIds]);
    await db.query(`DELETE FROM contacts WHERE "entityId" = ANY($1)`, [entityIds]);
    await db.query(`DELETE FROM entity_memberships WHERE "userId" = ANY($1)`, [mine("users")]);
    for (const t of order) await db.query(`DELETE FROM ${t} WHERE id = ANY($1)`, [mine(t)]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [mine("users")]);
    await db.end();
    await app.close();
  });

  const WHO = [null, "garbage"] as const; // a visitor, and a visitor whose cookie is not a valid session
  const detailPaths = () => ({
    startups: `/startups/${slug("main")}`, investors: `/investors/${slug("investor")}`, hubs: `/hubs/${slug("hub")}`, research: `/research/${slug("research")}`, multinationals: `/multinationals/${slug("mnc")}`,
  });

  describe("a visitor", () => {
    it.each(WHO)("gets no restricted value from any directory (list or detail), including with an invalid session (%s)", async (who) => {
      for (const section of ["startups", "investors", "hubs", "research", "multinationals"]) {
        const list = await get(who, `/${section}?limit=100`).expect(200);
        expect(json(list.body)).not.toContain(SEC);
        const detail = await get(who, detailPaths()[section as keyof ReturnType<typeof detailPaths>]).expect(200);
        expect(json(detail.body)).not.toContain(SEC);
        expect(detail.body.name).toContain(tag);
        expect(detail.headers["cache-control"]).toContain("no-store");
        expect(detail.headers.vary).toMatch(/Cookie/i);
      }
    });

    it("still gets the public profile", async () => {
      const s = (await get(null, detailPaths().startups).expect(200)).body;
      expect(s).toMatchObject({ slug: slug("main"), category: "Digital Health", city: "Riyadh", desc: "public description main", sfda: "Approved", ruwadScore: 1, investorCount: 1 });
      expect(s.contact).toEqual({ website: "https://vis-main.example.test", linkedin: "https://linkedin.com/company/vis" });
      for (const k of ["email", "phone", "registrationNumber", "fundingTotal", "valuation", "rounds", "traction", "marketTam", "factors", "scoreConfidence", "investorIds", "targetRaise", "fda"]) expect(s).not.toHaveProperty(k);
      expect(s.team[0]).toEqual({ name: "Sara Test", title: "CEO", isFounder: true, linkedin: null });
    });

    it("sees only a three-company preview of an investor's portfolio, with the total and no deal history", async () => {
      const v = (await get(null, detailPaths().investors).expect(200)).body;
      expect(v.portfolio).toHaveLength(3);
      expect(v.portfolioSize).toBe(5);
      expect(v).not.toHaveProperty("recentDeals");
      expect(json(v.portfolio)).not.toMatch(/fundingTotal|ROUND-/);
    });

    it("cannot learn the funding order by sorting or filtering", async () => {
      const names = async (who: string | null, q: string) => ((await get(who, `/startups?limit=100&${q}`).expect(200)).body.items as { slug: string }[]).filter((s) => s.slug.startsWith(`vis-${tag}`)).map((s) => s.slug);
      const byDefault = await names(null, "");
      expect(await names(null, "sort=fundingTotal&order=desc")).toEqual(byDefault);
      expect(await names(null, "sort=fundingTotal&order=asc")).toEqual(await names(null, "order=asc"));
      // a member can: the highest-funded startup comes first
      expect((await names("member", "sort=fundingTotal&order=desc"))[0]).toBe(slug("main"));
      // and for a visitor the default order really is by score, not funding
      expect(byDefault[byDefault.length - 1]).toBe(slug("main"));
    });

    it("gets a report with no pipeline fields, no members-only analysis and no per-company funding", async () => {
      const list = await get(null, "/reports?limit=100").expect(200);
      expect(json(list.body)).not.toContain(SEC);
      expect(list.body.items.map((r: { slug: string }) => r.slug)).not.toContain(slug("draft"));
      const legacy = (await get(null, `/reports/${slug("legacy")}`).expect(200)).body;
      expect(json(legacy)).not.toContain(SEC);
      expect(legacy.keyFindings).toEqual(["finding one", "finding two"]);
      expect(legacy.lockedFindingCount).toBe(2);
      expect(legacy.sections.map((s: { body: string }) => s.body)).toEqual(["", "", ""]);
      expect(legacy.sections[0].chart).toEqual([{ l: "a", v: 1 }]);
      const generated = await get(null, `/reports/${slug("generated")}`).expect(200);
      expect(json(generated.body)).not.toMatch(new RegExp(`${SEC}|999\\.99|555\\.55|1\\.11|searchesUsed|"query"|"tier"`));
      for (const k of ["researchQueries", "submissionId", "scope", "generationMode", "reportKind"]) expect(generated.body).not.toHaveProperty(k);
      expect(generated.body.internalStats.companies.map((c: { name: string }) => c.name)).toEqual(["Alpha", "Zed"]);
      expect(generated.headers["cache-control"]).toContain("no-store");
      await get(null, `/reports/${slug("draft")}`).expect(404);
    });

    it("gets ecosystem totals but no per-company or per-round funding from analytics", async () => {
      const overview = (await get(null, "/analytics/overview").expect(200)).body;
      expect(overview.topFundedStartups).toEqual([]);
      expect(overview.recentFundingRounds).toEqual([]);
      expect(typeof overview.trackedFundingSar).toBe("number");
      expect(json(overview)).not.toContain("fundingTotal");
      expect((await get(null, "/analytics/funding-by-stage").expect(200)).body.fundingByStage).toEqual([]);
      expect((await get(null, "/analytics/sector-distribution").expect(200)).body.fundingBySector).toEqual([]);
      expect((await get(null, "/analytics/ecosystem-snapshot").expect(200)).body.trackedFundingSar).toEqual(expect.any(Number));
    });

    it("cannot change anything: writes still need a session", async () => {
      await request(app.getHttpServer()).post("/api/startups").send({}).expect(401);
      await request(app.getHttpServer()).patch(`/api/startups/${ids.main}`).send({ name: "x" }).expect(401);
    });
  });

  describe("a signed-in member", () => {
    it("gets what the screens unlock, but not the registration number or anyone's internal fields", async () => {
      const s = (await get("member", detailPaths().startups).expect(200)).body;
      expect(s).toMatchObject({ email: `ceo-${SEC}@vis.test`, phone: `+966${SEC}`, fundingTotal: 123.45, valuation: 987.65, targetRaise: `RAISE-${SEC}`, fda: `FDA-${SEC}`, marketTam: `TAM-${SEC}` });
      expect(s.rounds).toEqual([{ round: "Seed", date: "2025-01", amount: "77.77", lead: `LEAD-${SEC}` }]);
      expect(s.contact).toMatchObject({ email: `contact-${SEC}@vis.test`, mainContact: `PERSON-${SEC}` });
      expect(s.investorIds).toEqual([slug("investor")]);
      expect(json(s)).not.toContain(`CR-${SEC}`);
      for (const k of ["registrationNumber", "foundedBasis", "scoringBasis", "createdAt"]) expect(s).not.toHaveProperty(k);
      expect(json(s.team)).not.toMatch(/91|92|experience/i);
    });

    it("gets the full portfolio, round details and deal history of an investor, and the contacts of the other directories", async () => {
      const v = (await get("member", detailPaths().investors).expect(200)).body;
      expect(v.portfolio).toHaveLength(5);
      expect(v.portfolio[0]).toMatchObject({ round: `ROUND-${SEC}`, year: 2024 });
      expect(v.recentDeals[0].startup).toBe(`DEAL-${SEC}`);
      expect(json((await get("member", detailPaths().hubs).expect(200)).body)).toContain(`hub-${SEC}@vis.test`);
      expect(json((await get("member", detailPaths().research).expect(200)).body)).toContain(`r-${SEC}@vis.test`);
      const m = (await get("member", detailPaths().multinationals).expect(200)).body;
      expect(m).toMatchObject({ email: `mnc-${SEC}@vis.test`, phone: `+966m${SEC}` });
      expect(json(m.investmentsList)).toContain(`INV-${SEC}`);
    });

    it("gets the full analysis of a report, never the search queries or counters", async () => {
      const legacy = (await get("member", `/reports/${slug("legacy")}`).expect(200)).body;
      expect(legacy.keyFindings).toHaveLength(4);
      expect(legacy.sections[0].body).toBe(`BODY1-${SEC}`);
      const generated = (await get("member", `/reports/${slug("generated")}`).expect(200)).body;
      expect(json(generated)).toMatch(/999\.99/);
      expect(json(generated)).not.toMatch(new RegExp(`QUERY-${SEC}|SEARCH-${SEC}|SCOPE-${SEC}|MODE-${SEC}|searchesUsed`));
      const overview = (await get("member", "/analytics/overview").expect(200)).body;
      expect(overview.topFundedStartups.length).toBeGreaterThan(0);
    });
  });

  describe("owners and administrators", () => {
    it("the owner of THIS startup sees its registration number; the owner of another one does not", async () => {
      expect(json((await get("owner", detailPaths().startups).expect(200)).body)).toContain(`CR-${SEC}`);
      expect(json((await get("other", detailPaths().startups).expect(200)).body)).not.toContain(`CR-${SEC}`);
      expect(json((await get("member", detailPaths().startups).expect(200)).body)).not.toContain(`CR-${SEC}`);
    });

    it("an administrator sees the registration number, and internal flags are still never sent", async () => {
      const s = (await get("admin", detailPaths().startups).expect(200)).body;
      expect(s.registrationNumber).toBe(`CR-${SEC}`);
      expect(s.email).toBe(`ceo-${SEC}@vis.test`);
      expect(s).not.toHaveProperty("foundedBasis");
      expect(s).not.toHaveProperty("scoringBasis");
      const r = (await get("admin", `/reports/${slug("generated")}`).expect(200)).body;
      for (const k of ["researchQueries", "submissionId", "scope", "generationMode", "reportKind"]) expect(r).not.toHaveProperty(k);
      await get("admin", `/reports/${slug("draft")}`).expect(404); // drafts are read through /reports/admin/*, not the public route
    });

    it("the admin report routes still serve everything to administrators and nothing to anyone else", async () => {
      const full = (await get("admin", `/reports/admin/by-slug/${slug("generated")}`).expect(200)).body;
      expect(full.researchQueries).toEqual([{ q: `QUERY-${SEC}` }]);
      await get("member", `/reports/admin/by-slug/${slug("generated")}`).expect(403);
      await get(null, `/reports/admin/by-slug/${slug("generated")}`).expect(401);
    });
  });
});
