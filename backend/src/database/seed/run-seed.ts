import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as bcrypt from "bcrypt";
import { NestFactory } from "@nestjs/core";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppModule } from "../../app.module";
import { DirectorySharedService } from "../../directory-shared/directory-shared.service";
import { InvestmentsService } from "../../investments/investments.service";
import { EntityKind, UserRole, WatchlistKind, IntroductionStatus } from "../../common/enums";

import { User } from "../../users/user.entity";
import { UserSettings } from "../../users/user-settings.entity";
import { EntityMembership } from "../../organizations/entity-membership.entity";
import { WatchlistItem } from "../../watchlists/watchlist-item.entity";
import { SavedSearch } from "../../saved-searches/saved-search.entity";
import { Introduction } from "../../introductions/introduction.entity";
import { ActivityLog } from "../../activity/activity-log.entity";
import { ActivityType } from "../../common/enums";

import { Startup } from "../../startups/startup.entity";
import { FundingRound } from "../../startups/funding-round.entity";
import { Investor } from "../../investors/investor.entity";
import { Hub } from "../../hubs/hub.entity";
import { HubProgram } from "../../hubs/hub-program.entity";
import { HubPortfolioItem } from "../../hubs/hub-portfolio-item.entity";
import { ResearchInstitution } from "../../research/research-institution.entity";
import { ResearchProject, Publication, ResearchTechnology, Researcher } from "../../research/research-child-entities.entity";
import { Multinational } from "../../multinationals/multinational.entity";
import { Report } from "../../reports/report.entity";
import { NewsArticle } from "../../news/news-article.entity";
import { NewsRelatedEntity } from "../../news/news-related-entity.entity";
import { Event } from "../../events/event.entity";

/** Idempotent: migrates the frontend's real mock data (captured to
 * mock-data.json via a temporary Next.js API route — see git history / the
 * completion report, never fabricated) into Postgres. Safe to re-run: every
 * upsert is keyed on the same id/slug the frontend already uses, so a
 * second run updates existing rows instead of duplicating them. */

interface MockData {
  startups: any[];
  investors: any[];
  hubs: any[];
  research: any[];
  multinationals: any[];
  reports: any[];
  news: any[];
  events: any[];
}

const KIND_BY_FRONTEND_TYPE: Record<string, EntityKind> = {
  startups: EntityKind.STARTUP,
  investors: EntityKind.INVESTOR,
  hubs: EntityKind.HUB,
  research: EntityKind.RESEARCH,
  multinationals: EntityKind.MULTINATIONAL,
};

async function upsertBySlug<T extends { id: string; slug: string }>(
  repo: Repository<T>,
  slug: string,
  values: Partial<T>,
): Promise<T> {
  let row = await repo.findOne({ where: { slug } as any });
  if (row) {
    Object.assign(row, values);
  } else {
    row = repo.create({ slug, ...values } as T);
  }
  return repo.save(row);
}

async function main() {
  const dataPath = path.join(__dirname, "mock-data.json");
  const data: MockData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });

  const startups = app.get<Repository<Startup>>(getRepositoryToken(Startup));
  const fundingRounds = app.get<Repository<FundingRound>>(getRepositoryToken(FundingRound));
  const investors = app.get<Repository<Investor>>(getRepositoryToken(Investor));
  const hubs = app.get<Repository<Hub>>(getRepositoryToken(Hub));
  const hubPrograms = app.get<Repository<HubProgram>>(getRepositoryToken(HubProgram));
  const hubPortfolioItems = app.get<Repository<HubPortfolioItem>>(getRepositoryToken(HubPortfolioItem));
  const research = app.get<Repository<ResearchInstitution>>(getRepositoryToken(ResearchInstitution));
  const researchProjects = app.get<Repository<ResearchProject>>(getRepositoryToken(ResearchProject));
  const researchPublications = app.get<Repository<Publication>>(getRepositoryToken(Publication));
  const researchTechnologies = app.get<Repository<ResearchTechnology>>(getRepositoryToken(ResearchTechnology));
  const researchers = app.get<Repository<Researcher>>(getRepositoryToken(Researcher));
  const multinationals = app.get<Repository<Multinational>>(getRepositoryToken(Multinational));
  const reports = app.get<Repository<Report>>(getRepositoryToken(Report));
  const newsArticles = app.get<Repository<NewsArticle>>(getRepositoryToken(NewsArticle));
  const newsRelated = app.get<Repository<NewsRelatedEntity>>(getRepositoryToken(NewsRelatedEntity));
  const events = app.get<Repository<Event>>(getRepositoryToken(Event));

  const users = app.get<Repository<User>>(getRepositoryToken(User));
  const userSettings = app.get<Repository<UserSettings>>(getRepositoryToken(UserSettings));
  const memberships = app.get<Repository<EntityMembership>>(getRepositoryToken(EntityMembership));
  const watchlistItems = app.get<Repository<WatchlistItem>>(getRepositoryToken(WatchlistItem));
  const savedSearchRepo = app.get<Repository<SavedSearch>>(getRepositoryToken(SavedSearch));
  const introRepo = app.get<Repository<Introduction>>(getRepositoryToken(Introduction));
  const activityRepo = app.get<Repository<ActivityLog>>(getRepositoryToken(ActivityLog));

  const shared = app.get(DirectorySharedService);
  const investments = app.get(InvestmentsService);

  const slugToId = { startups: new Map<string, string>(), investors: new Map<string, string>(), hubs: new Map<string, string>(), research: new Map<string, string>(), multinationals: new Map<string, string>(), reports: new Map<string, string>() };

  // ---------------------------------------------------------------- STARTUPS
  for (const s of data.startups) {
    const row = await upsertBySlug(startups, s.id, {
      name: s.name, category: s.category, subsector: s.subsector, tagline: s.tagline,
      country: s.country, city: s.city, hq: s.hq, founded: s.founded, stage: s.stage, status: s.status,
      businessModel: s.businessModel, employees: s.employees, fundingTotal: s.fundingTotal, valuation: s.valuation,
      fundraising: s.fundraising, targetRaise: s.targetRaise,
      desc: s.desc, problem: s.problem, solution: s.solution, advantage: s.advantage,
      sfda: s.regulatory.sfda, fda: s.regulatory.fda, ce: s.regulatory.ce, clinicalStatus: s.regulatory.clinical, patentStatus: s.regulatory.patent,
      marketTam: s.market.tam, marketSam: s.market.sam, marketSom: s.market.som, marketCompetitors: s.market.competitors,
      legalName: s.legalName, formerName: s.formerName, website: s.website, email: s.email, phone: s.phone, linkedin: s.linkedin,
      registrationNumber: s.registrationNumber, verified: s.verified,
      scoreGrowth: s.sub.growth, scoreFinancial: s.sub.financial, scoreMarket: s.sub.market, scoreTeam: s.sub.team,
      scoreRegulatory: s.sub.regulatory, scoreTech: s.sub.tech, score: s.score,
      provenanceConfidence: s.provenance.confidence,
      provenanceLastUpdated: s.provenance.lastUpdated, provenanceSources: s.provenance.sources,
      traction: s.traction, newsItems: s.newsItems ?? [],
    } as any);
    slugToId.startups.set(s.id, row.id);

    await shared.setTeamMembers(EntityKind.STARTUP, row.id, s.team.map((t: any) => ({ name: t.name, title: t.title, isFounder: !!t.founder })));
    await shared.setDocuments(EntityKind.STARTUP, row.id, (s.documents ?? []).map((d: any) => ({ name: d.n, onFile: d.ok })));
    await shared.setSectors(EntityKind.STARTUP, row.id, [s.category, s.subsector]);
    await shared.setContact(EntityKind.STARTUP, row.id, { website: s.website, email: s.email, phone: s.phone, linkedin: s.linkedin });

    await fundingRounds.delete({ startupId: row.id });
    if (s.rounds?.length) await fundingRounds.save(fundingRounds.create(s.rounds.map((r: any) => ({ startupId: row.id, round: r.round, date: r.date, amount: r.amount, lead: r.lead }))));
  }
  console.log(`Seeded ${data.startups.length} startups.`);

  // --------------------------------------------------------------- INVESTORS
  for (const v of data.investors) {
    const row = await upsertBySlug(investors, v.id, {
      name: v.name, short: v.short, type: v.type, city: v.city, founded: v.founded,
      desc: v.desc, thesis: v.thesis, stageFocus: v.stageFocus, ticket: v.ticket, aum: v.aum, available: v.available,
      investments: v.investments, exits: v.exits, hcDeals: v.hcDeals,
      provenanceConfidence: v.provenance.confidence,
      provenanceLastUpdated: v.provenance.lastUpdated, provenanceSources: v.provenance.sources,
      openOpps: v.openOpps ?? [], recentDeals: v.recentDeals ?? [], news: v.news ?? [],
    } as any);
    slugToId.investors.set(v.id, row.id);
    await shared.setTeamMembers(EntityKind.INVESTOR, row.id, v.team.map((t: any) => ({ name: t.name, title: t.title })));
    await shared.setSectors(EntityKind.INVESTOR, row.id, v.hcFocus ?? []);
  }
  console.log(`Seeded ${data.investors.length} investors.`);

  // Investor -> startup portfolio links, resolved by matching portfolio company names to seeded startup slugs.
  for (const v of data.investors) {
    const investorId = slugToId.investors.get(v.id)!;
    const links: { targetEntityType: EntityKind; targetEntityId: string; round?: string; year?: number }[] = [];
    for (const companyName of v.portfolio ?? []) {
      const match = data.startups.find((s) => s.name === companyName);
      if (match) links.push({ targetEntityType: EntityKind.STARTUP, targetEntityId: slugToId.startups.get(match.id)! });
    }
    if (links.length) await investments.setForInvestor(investorId, links);
  }

  // -------------------------------------------------------------------- HUBS
  for (const h of data.hubs) {
    const row = await upsertBySlug(hubs, h.id, {
      name: h.name, type: h.type, city: h.city, country: h.country, founded: h.founded, website: h.website,
      operatingRegion: h.operatingRegion, ownershipType: h.ownershipType, status: h.status, deadline: h.deadline,
      desc: h.desc, about: h.about, stagesSupported: h.stagesSupported, geographicCoverage: h.geographicCoverage,
      support: h.support, fundingAvailable: h.fundingAvailable, fundingType: h.fundingType,
      provenanceConfidence: h.provenance.confidence,
      provenanceLastUpdated: h.provenance.lastUpdated, provenanceSources: h.provenance.sources,
      focusAreas: h.focusAreas ?? [], eligibility: h.eligibility, application: h.application,
    } as any);
    slugToId.hubs.set(h.id, row.id);

    await shared.setDocuments(EntityKind.HUB, row.id, (h.documents ?? []).map((d: any) => ({ name: d.n, onFile: d.ok })));
    await shared.setSectors(EntityKind.HUB, row.id, h.healthcareFocus ?? []);
    if (h.contacts) await shared.setContact(EntityKind.HUB, row.id, { mainContact: h.contacts.programContact, email: h.contacts.email, phone: h.contacts.phone, website: h.contacts.website, linkedin: h.contacts.linkedin, extra: { hq: h.contacts.hq, applicationLink: h.contacts.applicationLink } });
    if (h.partnerships?.length) await shared.setPartnerships(EntityKind.HUB, row.id, h.partnerships.map((p: any) => ({ type: p.type ?? "", partnerName: p.partnerName ?? p.name ?? "", description: p.description ?? p.desc ?? "" })));

    await hubPrograms.delete({ hubId: row.id });
    if (h.programs?.length) await hubPrograms.save(hubPrograms.create(h.programs.map((p: any) => ({ hubId: row.id, name: p.name, type: p.type, status: p.status, duration: p.duration, location: p.location, format: p.format, deadline: p.deadline, cohortSize: p.cohortSize }))));

    await hubPortfolioItems.delete({ hubId: row.id });
    if (h.portfolio?.length) {
      await hubPortfolioItems.save(hubPortfolioItems.create(h.portfolio.map((p: any) => {
        const match = data.startups.find((s) => s.name === p.name);
        return { hubId: row.id, startupId: match ? slugToId.startups.get(match.id) : undefined, companyName: p.name, sector: p.sector, stage: p.stage, location: p.location, programName: p.program, year: p.year };
      })));
    }
  }
  console.log(`Seeded ${data.hubs.length} hubs.`);

  // ------------------------------------------------------------------ RESEARCH
  for (const r of data.research) {
    const row = await upsertBySlug(research, r.id, {
      name: r.name, type: r.type, city: r.city, country: r.country, founded: r.founded, website: r.website,
      numResearchers: r.numResearchers, numCenters: r.numCenters, numLabs: r.numLabs, about: r.about,
      collaborationStatus: r.collaborationStatus, technologyReadinessLevel: r.technologyReadinessLevel, patentsCount: r.patentsCount,
      provenanceConfidence: r.provenance.confidence,
      provenanceLastUpdated: r.provenance.lastUpdated, provenanceSources: r.provenance.sources,
      coreResearchAreas: r.coreResearchAreas ?? [], researchCenters: r.researchCenters ?? [], facilities: r.facilities ?? [],
      clinical: r.clinical, innovation: r.innovation, contacts: r.contacts,
    } as any);
    slugToId.research.set(r.id, row.id);

    await shared.setSectors(EntityKind.RESEARCH, row.id, r.healthcareFocus ?? r.coreResearchAreas ?? []);
    if (r.partnerships?.length) await shared.setPartnerships(EntityKind.RESEARCH, row.id, r.partnerships.map((p: any) => ({ type: p.type ?? "", partnerName: p.partnerName ?? p.partner ?? "", description: p.description ?? p.desc ?? "" })));

    await researchProjects.delete({ researchInstitutionId: row.id });
    if (r.activeProjects?.length) await researchProjects.save(researchProjects.create(r.activeProjects.map((p: any) => ({ researchInstitutionId: row.id, title: p.title, area: p.area, status: p.status, startYear: p.startYear, partners: p.partners ?? [] }))));

    await researchPublications.delete({ researchInstitutionId: row.id });
    if (r.publications?.length) await researchPublications.save(researchPublications.create(r.publications.map((p: any) => ({ researchInstitutionId: row.id, title: p.title, area: p.area, authors: p.authors, journal: p.journal, year: p.year }))));

    await researchTechnologies.delete({ researchInstitutionId: row.id });
    if (r.technologies?.length) await researchTechnologies.save(researchTechnologies.create(r.technologies.map((t: any) => ({ researchInstitutionId: row.id, name: t.name, area: t.area, trl: t.trl, status: t.status }))));

    await researchers.delete({ researchInstitutionId: row.id });
    if (r.researchers?.length) await researchers.save(researchers.create(r.researchers.map((p: any) => ({ researchInstitutionId: row.id, name: p.name, title: p.title, area: p.area }))));
  }
  console.log(`Seeded ${data.research.length} research institutions.`);

  // -------------------------------------------------------------- MULTINATIONALS
  for (const m of data.multinationals) {
    const row = await upsertBySlug(multinationals, m.id, {
      name: m.name, category: m.category, subsector: m.subsector, tagline: m.tagline, country: m.country, city: m.city, hq: m.hq,
      founded: m.founded, status: m.status, businessModel: m.businessModel, employees: m.employees, companySize: m.companySize,
      desc: m.desc, problem: m.problem, solution: m.solution, advantage: m.advantage,
      sfda: m.regulatory.sfda, fda: m.regulatory.fda, ce: m.regulatory.ce, clinicalStatus: m.regulatory.clinical, patentStatus: m.regulatory.patent,
      marketTam: m.market.tam, marketSam: m.market.sam, marketSom: m.market.som, marketCompetitors: m.market.competitors,
      saudiOffice: m.menaPresence.saudiOffice, regionalHeadquarters: m.menaPresence.regionalHeadquarters, manufacturing: m.menaPresence.manufacturing,
      distribution: m.menaPresence.distribution, clinicalOperations: m.menaPresence.clinicalOperations, trainingCenters: m.menaPresence.trainingCenters,
      researchOperations: m.menaPresence.researchOperations, countriesActiveIn: m.menaPresence.countriesActiveIn, regionalEmployees: m.menaPresence.regionalEmployees,
      rdFocus: m.rdFocus, rdCenters: m.rdCenters, openInnovation: m.openInnovation, startupCollaboration: m.startupCollaboration,
      partnershipInterest: m.partnershipInterest, techScouting: m.techScouting,
      legalName: m.legalName, website: m.website, email: m.email, phone: m.phone, linkedin: m.linkedin,
      provenanceConfidence: m.provenance.confidence,
      provenanceLastUpdated: m.provenance.lastUpdated, provenanceSources: m.provenance.sources,
      startupProgramsList: m.startupProgramsList ?? [], investmentsList: m.investmentsList ?? [], newsItems: m.newsItems ?? [],
    } as any);
    slugToId.multinationals.set(m.id, row.id);

    await shared.setTeamMembers(EntityKind.MULTINATIONAL, row.id, (m.team ?? []).map((t: any) => ({ name: t.name, title: t.title, isFounder: !!t.founder })));
    await shared.setDocuments(EntityKind.MULTINATIONAL, row.id, (m.documents ?? []).map((d: any) => ({ name: d.n, onFile: d.ok })));
    await shared.setProducts(EntityKind.MULTINATIONAL, row.id, (m.products ?? []).map((p: any) => ({ name: p.name, category: p.category, description: p.description })));
    await shared.setSectors(EntityKind.MULTINATIONAL, row.id, m.innovationAreas ?? [m.category]);
    await shared.setContact(EntityKind.MULTINATIONAL, row.id, { website: m.website, email: m.email, phone: m.phone, linkedin: m.linkedin });
    if (m.partnershipsList?.length) await shared.setPartnerships(EntityKind.MULTINATIONAL, row.id, m.partnershipsList.map((p: any) => ({ type: p.type ?? "", partnerName: "", description: p.desc ?? p.description ?? "" })));
  }
  console.log(`Seeded ${data.multinationals.length} multinationals.`);

  // ------------------------------------------------------------------- REPORTS
  for (const r of data.reports) {
    const row = await upsertBySlug(reports, r.id, {
      title: r.title, category: r.category, reportType: r.reportType, publicationDate: r.publicationDate,
      description: r.description, geography: r.geography, sector: r.sector, authors: r.authors,
      readingTime: r.readingTime, pages: r.pages, badges: r.badges, executiveSummary: r.executiveSummary,
      keyFindings: r.keyFindings, marketStats: r.marketStats, sections: r.sections, sources: r.sources,
      publishedAt: new Date(r.publicationDate),
      provenanceConfidence: r.provenance?.confidence, provenanceLastUpdated: r.provenance?.lastUpdated, provenanceSources: r.provenance?.sources ?? [],
    } as any);
    slugToId.reports.set(r.id, row.id);
  }
  // Second pass: resolve slug-based relations to real uuids now that everything referenced exists.
  for (const r of data.reports) {
    const id = slugToId.reports.get(r.id)!;
    await reports.update(id, {
      relatedStartupIds: (r.relatedCompanies ?? []).map((s: string) => slugToId.startups.get(s)).filter(Boolean),
      relatedInvestorIds: (r.relatedInvestors ?? []).map((s: string) => slugToId.investors.get(s)).filter(Boolean),
      relatedReportIds: (r.relatedReports ?? []).map((s: string) => slugToId.reports.get(s)).filter(Boolean),
    } as any);
  }
  console.log(`Seeded ${data.reports.length} reports.`);

  // --------------------------------------------------------------------- NEWS
  for (const n of data.news) {
    let row = await newsArticles.findOne({ where: { title: n.title, publishedDate: n.publishedDate } });
    if (row) {
      Object.assign(row, { source: n.source, category: n.category, sector: n.sector, geography: n.geography, summary: n.summary, sourceUrl: n.sourceUrl });
    } else {
      row = newsArticles.create({ title: n.title, source: n.source, publishedDate: n.publishedDate, category: n.category, sector: n.sector, geography: n.geography, summary: n.summary, sourceUrl: n.sourceUrl });
    }
    row = await newsArticles.save(row);

    await newsRelated.delete({ newsId: row.id });
    const related = (n.relatedEntities ?? [])
      .map((e: any) => {
        const kind = KIND_BY_FRONTEND_TYPE[e.type];
        const map = kind === EntityKind.STARTUP ? slugToId.startups : kind === EntityKind.INVESTOR ? slugToId.investors : kind === EntityKind.HUB ? slugToId.hubs : kind === EntityKind.RESEARCH ? slugToId.research : slugToId.multinationals;
        const entityId = map.get(e.id);
        return entityId ? { newsId: row!.id, entityType: kind, entityId, entitySlug: e.id, name: e.name } : null;
      })
      .filter(Boolean);
    if (related.length) await newsRelated.save(newsRelated.create(related as any));
  }
  console.log(`Seeded ${data.news.length} news articles.`);

  // ------------------------------------------------------------------- EVENTS
  for (const e of data.events) {
    let row = await events.findOne({ where: { name: e.name, date: e.date } });
    if (row) {
      Object.assign(row, { location: e.location, country: e.country, type: e.type, sector: e.sector, organizer: e.organizer, description: e.description, registrationStatus: e.registrationStatus, url: e.url });
    } else {
      row = events.create({ name: e.name, date: e.date, location: e.location, country: e.country, type: e.type, sector: e.sector, organizer: e.organizer, description: e.description, registrationStatus: e.registrationStatus, url: e.url });
    }
    await events.save(row);
  }
  console.log(`Seeded ${data.events.length} events.`);

  // ------------------------------------------------------------- DEMO/ADMIN USERS
  // Mirrors the old localStorage app's seedDemoAccount()/seedAdminAccount() —
  // same credentials, but now a real bcrypt-hashed row a real login checks.
  async function upsertUser(email: string, plainPassword: string, fields: Partial<User>): Promise<User> {
    let user = await users.findOne({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(plainPassword, 12);
      user = await users.save(users.create({ email, passwordHash, ...fields }));
      await userSettings.save(userSettings.create({ userId: user.id }));
    }
    return user;
  }

  const demoUser = await upsertUser("demo@ruwad.sa", "demo", {
    firstName: "Demo", lastName: "User", role: UserRole.FOUNDER, jobTitle: "Founder", organization: "Medka DX", country: "Saudi Arabia", city: "Riyadh",
  });
  await upsertUser("admin@ruwad.sa", "admin", {
    firstName: "Admin", lastName: "User", role: UserRole.RUWAD_ADMIN, jobTitle: "Platform Admin", country: "Saudi Arabia", city: "Riyadh",
  });
  console.log("Seeded demo@ruwad.sa and admin@ruwad.sa accounts.");

  // ------------------------------------------------------- DEMO WORKSPACE DATA
  // Gives the demo account real, visible Workspace content on first login —
  // same idea as the old seedDemoWorkspaceData(), now real DB rows owned by
  // a real user instead of a localStorage snapshot.
  const demoStartupId = slugToId.startups.get("medka-dx");
  if (demoStartupId && !(await memberships.exists({ where: { userId: demoUser.id, entityId: demoStartupId } }))) {
    await memberships.save(memberships.create({ userId: demoUser.id, kind: EntityKind.STARTUP, entityId: demoStartupId, views: 214 }));
  }

  const demoWatchlist: [WatchlistKind, string | undefined][] = [
    [WatchlistKind.INVESTOR, slugToId.investors.get("stv")],
    [WatchlistKind.HUB, slugToId.hubs.get("misk-accelerator")],
    [WatchlistKind.RESEARCH, slugToId.research.get("kaust")],
  ];
  for (const [kind, entityId] of demoWatchlist) {
    if (!entityId) continue;
    const exists = await watchlistItems.exists({ where: { userId: demoUser.id, kind, entityId } });
    if (!exists) await watchlistItems.save(watchlistItems.create({ userId: demoUser.id, kind, entityId }));
  }

  const demoSearchLabel = "AI Healthcare, Series A+";
  if (!(await savedSearchRepo.exists({ where: { userId: demoUser.id, label: demoSearchLabel } }))) {
    await savedSearchRepo.save(savedSearchRepo.create({
      userId: demoUser.id, entityType: "startups", label: demoSearchLabel, search: "",
      filters: { category: ["AI Healthcare"], stage: ["Series A", "Series B"] }, resultCountAtSave: 2, alertEnabled: true,
    }));
  }
  const demoSearchLabel2 = "Government-backed investors";
  if (!(await savedSearchRepo.exists({ where: { userId: demoUser.id, label: demoSearchLabel2 } }))) {
    await savedSearchRepo.save(savedSearchRepo.create({
      userId: demoUser.id, entityType: "investors", label: demoSearchLabel2, search: "",
      filters: { type: ["Government Fund", "Sovereign"] }, resultCountAtSave: 2, alertEnabled: false,
    }));
  }

  if (!(await introRepo.exists({ where: { userId: demoUser.id, investor: "Impact46" } }))) {
    const mkHistory = (...statuses: IntroductionStatus[]) => statuses.map((status, i) => ({ status, date: new Date(Date.now() - (statuses.length - i) * 5 * 86400000).toISOString().slice(0, 10) }));
    await introRepo.save(introRepo.create([
      {
        userId: demoUser.id, status: IntroductionStatus.COMPLETED, investor: "Saudi Venture Capital", startup: "Medka DX",
        reasonType: "Investment", reason: "Exploring a Series A lead", message: "Would love to connect on a potential Series A.",
        statusHistory: mkHistory(IntroductionStatus.PENDING, IntroductionStatus.ACCEPTED, IntroductionStatus.COMPLETED),
      },
      {
        userId: demoUser.id, status: IntroductionStatus.IN_REVIEW, investor: "STV", startup: "Medka DX",
        reasonType: "Investment", reason: "Series A introduction", message: "Looking for a lead on our upcoming Series A round.",
        statusHistory: mkHistory(IntroductionStatus.PENDING, IntroductionStatus.IN_REVIEW),
      },
      {
        userId: demoUser.id, status: IntroductionStatus.PENDING, investor: "Impact46", startup: "Medka DX",
        reasonType: "Strategic Partnership", reason: "Regional distribution partnership", message: "Interested in a strategic partnership around regional distribution.",
        statusHistory: mkHistory(IntroductionStatus.PENDING),
      },
    ]));
  }
  if (!(await activityRepo.exists({ where: { userId: demoUser.id } }))) {
    await activityRepo.save(activityRepo.create([
      { userId: demoUser.id, type: ActivityType.INTRO_SUBMITTED, text: "Requested an introduction to Impact46", route: "/introductions" },
      { userId: demoUser.id, type: ActivityType.SEARCH_SAVED, text: `Saved search "${demoSearchLabel}"`, route: "/saved-searches" },
      { userId: demoUser.id, type: ActivityType.WATCHLIST_ADD, text: "Added an investor to your watchlist", route: "/watchlist" },
      { userId: demoUser.id, type: ActivityType.LISTING_EDITED, text: "Updated Medka DX company profile", route: "/workspace/startup" },
    ]));
  }
  console.log("Seeded demo workspace data (owned listing, watchlist, saved searches, introductions, activity).");

  await app.close();
  console.log("Seed complete.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", err);
  process.exit(1);
});
