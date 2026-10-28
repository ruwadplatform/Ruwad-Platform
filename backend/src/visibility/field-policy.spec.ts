import {
  analyticsFundingByStage, analyticsOverview, analyticsSectorDistribution, hubDetail, investorDetail, investorListItem, multinationalDetail, reportListItem, reportView, researchDetail,
  startupDetail, startupSummary, Rec,
} from "./field-policy";
import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";
import { baseAccess, GUEST, viewerFromUser } from "./viewer";

const startupFull = (): Rec => ({
  id: "s1", slug: "acme", name: "Acme", logo: "AC", logoImageId: null, category: "Digital Health", subsector: "x", tagline: "t", country: "SA", city: "Riyadh", hq: "Riyadh", founded: 2020,
  stage: "Seed", status: "Active", businessModel: "B2B", employees: 12, desc: "d", problem: "p", solution: "s", advantage: "a", legalName: "Acme LLC", formerName: "—",
  website: "acme.sa", linkedin: "https://linkedin.com/company/acme", email: "ceo@acme.sa", phone: "+966500000000", registrationNumber: "CR-123456",
  fundingTotal: 12.5, valuation: 80, fundraising: true, targetRaise: "SAR 5M", sfda: "Approved", fda: "No", ce: "No", clinicalStatus: "Phase 1", patentStatus: "Filed",
  marketTam: "1B", marketSam: "100M", marketSom: "10M", marketCompetitors: ["Rival"], traction: { revenue: "1M", growth: "10%", customers: 5, users: 5, partnerships: 1, pilots: 1, markets: "KSA", awards: "-" },
  verified: "unclaimed", ruwadScore: 7.4, scoreStatus: "CALCULATED", scoreConfidence: 0.8, scoreVersion: "v2", factors: { growth: { score: 7, confidence: 0.8 } },
  provenanceConfidence: "Medium", provenanceLastUpdated: "2026-01-01", provenanceSources: ["Self-reported"], newsItems: [], sectors: ["Digital Health"],
  team: [{ id: "t1", entityType: "STARTUP", entityId: "s1", name: "Sara", title: "CEO", isFounder: true, linkedin: null, experienceYears: 9, healthcareExperienceYears: 4, previousStartupExperience: true }],
  rounds: [{ id: "r1", startupId: "s1", round: "Seed", date: "2025-01", amount: 3, lead: "Fund A" }], products: [], hasPendingClaim: false,
  investorIds: ["fund-a", "fund-b"],
  contact: { id: "c1", entityType: "STARTUP", entityId: "s1", mainContact: "Sara", email: "ceo@acme.sa", phone: "+966500000000", website: "acme.sa", linkedin: "https://linkedin.com/company/acme", extra: { hq: "x" } },
  foundedBasis: "KNOWN", scoringBasis: "EXISTING_DATA", someFutureColumn: "secret", createdAt: "2026", updatedAt: "2026",
});

const RESTRICTED_FOR_VISITOR = [
  "email", "phone", "registrationNumber", "fundingTotal", "valuation", "fundraising", "targetRaise", "fda", "ce", "clinicalStatus", "patentStatus", "marketTam", "marketSam",
  "marketSom", "marketCompetitors", "traction", "rounds", "investorIds", "scoreConfidence", "scoreVersion", "factors", "foundedBasis", "scoringBasis", "someFutureColumn", "createdAt",
];

describe("startups", () => {
  it("a visitor gets the public profile and none of the restricted fields", () => {
    const out = startupDetail(startupFull(), "public");
    for (const k of RESTRICTED_FOR_VISITOR) expect(out).not.toHaveProperty(k);
    expect(out).toMatchObject({ name: "Acme", desc: "d", website: "acme.sa", category: "Digital Health", city: "Riyadh", ruwadScore: 7.4, scoreStatus: "CALCULATED", investorCount: 2 });
    expect(out.contact).toEqual({ website: "acme.sa", linkedin: "https://linkedin.com/company/acme" });
    expect(out.team).toEqual([{ name: "Sara", title: "CEO", isFounder: true, linkedin: null }]);
  });

  it("the visitor's JSON does not contain any restricted value anywhere", () => {
    const json = JSON.stringify(startupDetail(startupFull(), "public"));
    for (const v of ["ceo@acme.sa", "+966500000000", "CR-123456", "12.5", "SAR 5M", "Fund A", "Phase 1", "fund-b", "secret"]) expect(json).not.toContain(v);
  });

  it("a signed-in member keeps what the screens unlock, but never the registration number or unlisted columns", () => {
    const out = startupDetail(startupFull(), "member");
    expect(out).toMatchObject({ email: "ceo@acme.sa", phone: "+966500000000", fundingTotal: 12.5, valuation: 80, sfda: "Approved", marketTam: "1B", investorIds: ["fund-a", "fund-b"] });
    expect(out.rounds).toEqual([{ round: "Seed", date: "2025-01", amount: 3, lead: "Fund A" }]);
    expect(out.contact).toMatchObject({ email: "ceo@acme.sa", mainContact: "Sara" });
    for (const k of ["registrationNumber", "someFutureColumn", "foundedBasis", "scoringBasis", "createdAt"]) expect(out).not.toHaveProperty(k);
  });

  it("the record's owner and administrators see the registration number; internal flags are never sent", () => {
    expect(startupDetail(startupFull(), "owner")).toMatchObject({ registrationNumber: "CR-123456" });
    const admin = startupDetail(startupFull(), "admin");
    expect(admin).toMatchObject({ registrationNumber: "CR-123456", email: "ceo@acme.sa" });
    expect(admin).not.toHaveProperty("foundedBasis");
    expect(admin).not.toHaveProperty("scoringBasis");
  });

  it("list items: the funding total is for members only; the SFDA badge shown on every card is public", () => {
    const visitor = startupSummary(startupFull(), "public");
    expect(visitor).not.toHaveProperty("fundingTotal");
    expect(visitor).not.toHaveProperty("email");
    expect(visitor).toMatchObject({ name: "Acme", ruwadScore: 7.4, sfda: "Approved" });
    expect(startupSummary(startupFull(), "member")).toMatchObject({ fundingTotal: 12.5, sfda: "Approved" });
  });
});

describe("investors", () => {
  const investor = (): Rec => ({
    id: "v1", slug: "fund-a", name: "Fund A", logo: "FA", logoImageId: null, short: "FA", type: "VC", city: "Riyadh", founded: 2015, desc: "d", thesis: "t", stageFocus: ["Seed"], ticket: "1-3M",
    aum: "100M", available: "yes", investments: 10, exits: 1, hcDeals: 4, verified: "unclaimed", website: "fund-a.vc", provenanceConfidence: "Medium", provenanceLastUpdated: "2026-01-01",
    provenanceSources: [], openOpps: [], recentDeals: [{ startup: "Acme", round: "Seed", date: "2025-01" }], news: [], sectors: [], team: [{ name: "Omar", title: "GP", isFounder: false }],
    hasPendingClaim: false, internalNote: "secret",
    portfolio: [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, slug: `s${n}`, name: `S${n}`, logo: "S", category: "c", city: "Riyadh", tagline: "t", stage: "Seed", ruwadScore: 7, fundingTotal: 9, email: "x@y", round: "Seed", year: 2024 })),
  });

  it("a visitor sees a three-company preview with the total, no round details and no deal history", () => {
    const out = investorDetail(investor(), "public");
    expect(out.portfolio as Rec[]).toHaveLength(3);
    expect(out.portfolioSize).toBe(5);
    expect(JSON.stringify(out)).not.toMatch(/fundingTotal|"round"|"year"|recentDeals|internalNote|x@y/);
    expect(out).toMatchObject({ name: "Fund A", aum: "100M", hcDeals: 4 });
  });

  it("a member sees the whole portfolio with rounds and the deal history, still without any company's funding total", () => {
    const out = investorDetail(investor(), "member");
    expect(out.portfolio as Rec[]).toHaveLength(5);
    expect((out.portfolio as Rec[])[0]).toMatchObject({ round: "Seed", year: 2024 });
    expect(out.recentDeals).toHaveLength(1);
    expect(JSON.stringify(out)).not.toMatch(/fundingTotal|x@y|internalNote/);
  });

  it("list items carry only the public listing fields", () => {
    const out = investorListItem({ ...investor(), portfolioSize: 5, hcFocus: [] }, "public");
    expect(out).not.toHaveProperty("recentDeals");
    expect(out).not.toHaveProperty("internalNote");
    expect(out).toMatchObject({ portfolioSize: 5 });
  });
});

describe("hubs, research institutions and multinationals", () => {
  const contact = { id: "c", mainContact: "Lina", email: "hub@x.sa", phone: "+9661", website: "hub.sa", linkedin: "li", extra: { hq: "x" } };

  it("contact people, emails and phone numbers are for members; the public website is not private", () => {
    const hub = { id: "h", slug: "hub", name: "Hub", status: "Open", contact, secretColumn: 1 };
    const visitor = hubDetail(hub, "public");
    expect(visitor.contact).toEqual({ website: "hub.sa", linkedin: "li" });
    expect(visitor).not.toHaveProperty("secretColumn");
    expect(JSON.stringify(visitor)).not.toMatch(/hub@x\.sa|\+9661|Lina/);
    expect(hubDetail(hub, "member").contact).toMatchObject({ email: "hub@x.sa", phone: "+9661", mainContact: "Lina" });
  });

  it("a research institution's contacts block is for members", () => {
    const inst = { id: "r", slug: "kaust", name: "KAUST", contacts: { email: "r@x.sa", phone: "+9662" }, contact };
    expect(JSON.stringify(researchDetail(inst, "public"))).not.toMatch(/r@x\.sa|\+9662|hub@x\.sa/);
    expect(researchDetail(inst, "member")).toHaveProperty("contacts");
  });

  it("a multinational's email, phone and investments are for members", () => {
    const m = { id: "m", slug: "pfizer", name: "Pfizer", website: "p.com", email: "m@p.com", phone: "+9663", investmentsList: [{ company: "Acme", sector: "x", round: "A", year: 2024 }], contact };
    const visitor = multinationalDetail(m, "public");
    expect(JSON.stringify(visitor)).not.toMatch(/m@p\.com|\+9663|Acme|investmentsList/);
    expect(multinationalDetail(m, "member")).toMatchObject({ email: "m@p.com", phone: "+9663" });
  });
});

describe("reports", () => {
  const legacy = (): Rec => ({
    id: "r1", slug: "legacy", title: "T", category: "c", reportType: "t", publicationDate: "2026-01-01", description: "d", geography: "g", sector: "s", authors: [], readingTime: "5", pages: 5,
    badges: [], executiveSummary: "long summary", keyFindings: ["f1", "f2", "f3", "f4"], marketStats: [{ label: "A", value: "1" }],
    sections: [{ heading: "H1", body: "b1", chart: [{ l: "a", v: 1 }] }, { heading: "H2", body: "b2", chart: [{ l: "b", v: 2 }] }, { heading: "H3", body: "b3" }],
    sources: ["s"], isPublished: true, origin: "RUWAD", researchQueries: [{ q: "pipeline" }], submissionId: "sub-1", scope: { sector: "x" }, generationMode: "ai", reportKind: "SECTOR_OVERVIEW",
    relatedStartupIds: ["s1"], externalSources: [], libraryContent: null, generated: null, internalStats: null, someFutureColumn: "secret",
  });

  it("pipeline fields and unlisted columns are never sent to anyone, administrators included", () => {
    for (const access of ["public", "member", "admin"] as const) {
      const out = reportView(legacy(), access);
      for (const k of ["researchQueries", "submissionId", "scope", "generationMode", "reportKind"]) expect(out).not.toHaveProperty(k);
    }
    expect(reportView(legacy(), "public")).not.toHaveProperty("someFutureColumn");
    expect(reportView(legacy(), "member")).not.toHaveProperty("someFutureColumn");
  });

  it("a hand-written report keeps its analysis for members; a visitor reads the headline findings and the first chart", () => {
    const visitor = reportView(legacy(), "public");
    expect(visitor.keyFindings).toEqual(["f1", "f2"]);
    expect(visitor.lockedFindingCount).toBe(2);
    expect(visitor.executiveSummary).toBe("");
    const sections = visitor.sections as Rec[];
    expect(sections.map((s) => s.body)).toEqual(["", "", ""]);
    expect(sections[0].chart).toEqual([{ l: "a", v: 1 }]);
    expect(sections[1].chart).toEqual([]);
    expect(sections[1].chartLocked).toBe(true);
    expect(JSON.stringify(visitor)).not.toMatch(/b1|b2|b3|f3|f4|long summary/);
    const member = reportView(legacy(), "member");
    expect(member.keyFindings).toHaveLength(4);
    expect((member.sections as Rec[])[0].body).toBe("b1");
  });

  const generated = (): Rec => ({
    ...legacy(), keyFindings: [], sections: [], reportKind: "STARTUP_ANALYSIS", origin: "RUWAD",
    generated: { overviewLines: ["Acme is a Seed company in Riyadh.", "Recorded funding on RUWĀD: SAR 12.5M."], methodology: ["m"], coverageNotice: "n", scopeLabel: "Acme", research: { status: "ok", searchesUsed: 4, cacheHits: 2, sourcesKept: 6, note: "fine" } },
    aiOverview: "Acme raised SAR 12.5M at a SAR 80M valuation.", executiveSummary: "Acme is a Seed company. Recorded funding: SAR 12.5M.",
    externalSources: [{ id: "e1", title: "T", url: "https://x", domain: "x", snippet: "s", publishedAt: null, publishedText: null, query: "acme funding site:x", topic: "funding", sourceType: "NEWS", sourceTypeLabel: "News", tier: 2, retrievedAt: "2026" }],
    internalStats: {
      coverage: { startups: 10, investors: 3, asOf: "2026-01-01" }, metrics: [{ label: "Total recorded funding", value: "SAR 99M" }],
      distributions: [{ key: "fundingByStage", rows: [] }, { key: "fundingByCompany", rows: [{ l: "Acme", v: 12.5 }] }],
      companies: [{ slug: "acme", name: "Acme", stage: "Seed", city: "Riyadh", category: "x", fundingTotal: 12.5 }], investors: [], fundingSought: [{ slug: "acme", name: "Acme", stage: "Seed", target: "SAR 5M" }],
      subject: {
        slug: "acme", name: "Acme",
        facts: [{ label: "Sector", value: "Digital Health" }, { label: "Recorded funding", value: "SAR 12.5M" }, { label: "Valuation (as reported)", value: "SAR 80M" }, { label: "Currently fundraising", value: "Yes — seeking SAR 5M" }, { label: "Regulatory (as recorded)", value: "SFDA Approved" }],
        peers: [{ label: "Other x startups on RUWĀD", value: "3" }, { label: "Peers with more recorded funding", value: "1 of 3" }],
        profile: [{ heading: "Company overview", items: [] }, { heading: "Funding", items: [{ label: "Recorded funding", value: "SAR 12.5M" }] }, { heading: "Investors", items: [] }, { heading: "Clinical / regulatory", items: [] }, { heading: "Team", items: [] }],
      },
    },
  });

  it("a generated report for a visitor loses per-company funding, its restricted subject facts and the pipeline counters", () => {
    const out = reportView(generated(), "public");
    const json = JSON.stringify(out);
    for (const leak of ["12.5", "SAR 80M", "SAR 5M", "fundingByCompany", "searchesUsed", "cacheHits", "sourcesKept", "acme funding site:x", "\"tier\"", "SFDA Approved", "\"query\""]) expect(json).not.toContain(leak);
    expect(json).toContain("Acme is a Seed company in Riyadh.");
    expect(json).toContain("SAR 99M"); // ecosystem-wide totals stay
    expect(((out.internalStats as Rec).subject as Rec).facts).toEqual([{ label: "Sector", value: "Digital Health" }]);
    // a list ranked by funding would reveal the ranking: a visitor's lists are in name order
    const ranked = reportView({ ...generated(), internalStats: { ...(generated().internalStats as Rec), companies: [{ slug: "z", name: "Zed", fundingTotal: 99 }, { slug: "a", name: "Alpha", fundingTotal: 1 }] } }, "public");
    expect(((ranked.internalStats as Rec).companies as Rec[]).map((c) => c.name)).toEqual(["Alpha", "Zed"]);
    expect(((out.internalStats as Rec).subject as Rec).profile).toEqual([{ heading: "Company overview", items: [] }, { heading: "Team", items: [] }]);
    expect((out.generated as Rec).research).toEqual({ status: "ok", note: "fine" });
  });

  it("a member keeps the figures, but the search queries and counters are gone for everyone", () => {
    const out = reportView(generated(), "member");
    const json = JSON.stringify(out);
    expect(json).toContain("12.5");
    expect(json).toContain("SAR 5M");
    for (const leak of ["searchesUsed", "cacheHits", "acme funding site:x", "\"tier\""]) expect(json).not.toContain(leak);
  });

  it("report lists carry no heavy payload, relations or pipeline fields", () => {
    const out = reportListItem({ ...generated(), relatedCompanies: [{ id: "s1" }] }, "public");
    for (const k of ["internalStats", "generated", "aiOverview", "libraryContent", "relatedCompanies", "researchQueries", "submissionId"]) expect(out).not.toHaveProperty(k);
  });
});

describe("analytics", () => {
  const overview = (): Rec => ({
    trackedFundingSar: 500, totalDealCount: 40, avgDealSizeSar: 12, topFundedStartups: [{ id: "a", fundingTotal: 90 }], recentFundingRounds: [{ startup: "A", amount: 9 }],
    highestScoreStartups: [{ id: "a", fundingTotal: 90, ruwadScore: 9 }], recentlyFoundedStartups: [{ id: "b", fundingTotal: 1 }], recentlyUpdatedStartups: [{ id: "c", fundingTotal: 2 }],
  });

  it("a visitor gets no per-company or per-round amounts and no funding ranking", () => {
    const out = analyticsOverview(overview(), "public");
    expect(out.topFundedStartups).toEqual([]);
    expect(out.recentFundingRounds).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("fundingTotal");
    expect(out.trackedFundingSar).toBe(500);
    expect((out.highestScoreStartups as Rec[])[0]).toMatchObject({ id: "a", ruwadScore: 9 });
  });

  it("members get the full overview", () => {
    expect(analyticsOverview(overview(), "member")).toEqual(overview());
  });

  it("funding breakdown charts are for members", () => {
    expect(analyticsFundingByStage({ fundingByStage: [{ l: "Seed", v: 1 }], dealsByStage: [{ l: "Seed", v: 1 }] }, "public")).toEqual({ fundingByStage: [], dealsByStage: [{ l: "Seed", v: 1 }] });
    expect(analyticsSectorDistribution({ startupSectorCounts: [{ l: "x", v: 1 }], fundingBySector: [{ l: "x", v: 5 }] }, "public")).toEqual({ startupSectorCounts: [{ l: "x", v: 1 }], fundingBySector: [] });
    expect(analyticsFundingByStage({ fundingByStage: [{ l: "Seed", v: 1 }] }, "member")).toEqual({ fundingByStage: [{ l: "Seed", v: 1 }] });
  });
});

describe("viewer resolution", () => {
  it("only a verified session raises access; roles map to tiers", () => {
    expect(baseAccess(GUEST)).toBe("public");
    expect(baseAccess(viewerFromUser(undefined))).toBe("public");
    expect(baseAccess(viewerFromUser({ userId: "u", role: "FOUNDER" }))).toBe("member");
    expect(baseAccess(viewerFromUser({ userId: "u", role: "INVESTOR" }))).toBe("member");
    expect(baseAccess(viewerFromUser({ userId: "u", role: "ORGANIZATION_ADMIN" }))).toBe("member");
    expect(baseAccess(viewerFromUser({ userId: "u", role: "RUWAD_ADMIN" }))).toBe("admin");
    expect(baseAccess(viewerFromUser({ userId: "u", role: "SUPER_ADMIN" }))).toBe("admin");
  });

  it("the optional guard never rejects: a bad, expired or missing token is a visitor", () => {
    const guard = new OptionalJwtAuthGuard();
    expect(guard.handleRequest(new Error("jwt expired"), false)).toBeNull();
    expect(guard.handleRequest(null, false)).toBeNull();
    expect(guard.handleRequest(null, { userId: "u", role: "USER" })).toEqual({ userId: "u", role: "USER" });
  });
});
