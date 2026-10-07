import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { Startup } from "../../startups/startup.entity";
import { FundingRound } from "../../startups/funding-round.entity";
import { TeamMember } from "../../directory-shared/team-member.entity";
import { DocumentRef } from "../../directory-shared/document-ref.entity";
import { ProductRef } from "../../directory-shared/product.entity";
import { Contact } from "../../directory-shared/contact.entity";
import { Sector } from "../../directory-shared/sector.entity";
import { EntitySector } from "../../directory-shared/entity-sector.entity";
import { EntityKind, ScoringBasis } from "../../common/enums";
import { uniqueSlugFor } from "../../common/slug.util";
import { normalizeLinkedInUrl } from "../../common/linkedin.util";
import type { ScoringFeatures } from "../../scoring/scoring.types";
import { trlLevelForLabel } from "../../scoring/trl-labels";
import { SubmissionPublisher, arr, bool, num, numOrUndefined, str, strArr } from "./publisher.types";

@Injectable()
export class StartupSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.STARTUP;

  async publish(manager: EntityManager, p: Record<string, unknown>): Promise<string> {
    const startups = manager.getRepository(Startup);
    const slug = await uniqueSlugFor((s) => startups.findOne({ where: { slug: s } }), str(p.name, "untitled-startup"));

    const startup = await startups.save(startups.create({
      slug,
      name: str(p.name), logoImageId: str(p.logoImageId) || undefined,
      category: str(p.category), subsector: str(p.subsector), tagline: str(p.tagline),
      country: str(p.country), city: str(p.city), hq: str(p.hq, `${str(p.city)}, ${str(p.country)}`),
      founded: num(p.founded, new Date().getFullYear()), stage: str(p.stage), status: str(p.status, "Active"),
      businessModel: str(p.businessModel), employees: num(p.employees), fundingTotal: num(p.fundingTotal),
      valuation: num(p.valuation), fundraising: bool(p.fundraising), targetRaise: str(p.targetRaise) || undefined,
      desc: str(p.desc), problem: str(p.problem), solution: str(p.solution), advantage: str(p.advantage),
      sfda: str(p.sfda, "Not Submitted"), fda: str(p.fda, "N/A"), ce: str(p.ce, "N/A"),
      clinicalStatus: str(p.clinicalStatus, "Not disclosed"), patentStatus: str(p.patentStatus, "Not disclosed"),
      marketTam: str(p.marketTam), marketSam: str(p.marketSam), marketSom: str(p.marketSom), marketCompetitors: strArr(p.marketCompetitors),
      legalName: str(p.legalName, str(p.name)), formerName: str(p.formerName) || "—", website: str(p.website),
      email: str(p.email), phone: str(p.phone), linkedin: str(p.linkedin),
      registrationNumber: `CR-${Math.floor(100000 + Math.random() * 899999)}`,
      verified: "self-reported",
      scoringBasis: ScoringBasis.EXISTING_DATA, // scored on the information provided; see ScoringBasis
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      traction: p.traction && typeof p.traction === "object" ? (p.traction as Startup["traction"]) : undefined,
      newsItems: [],
    }));

    const team = arr<Record<string, unknown>>(p.founders).concat(arr<Record<string, unknown>>(p.teamMembers));
    if (team.length) {
      await manager.getRepository(TeamMember).save(team.map((t) => manager.getRepository(TeamMember).create({
        entityType: EntityKind.STARTUP, entityId: startup.id, name: str(t.name), title: str(t.title), isFounder: bool(t.isFounder, true),
        experienceYears: numOrUndefined(t.experienceYears), healthcareExperienceYears: numOrUndefined(t.healthcareExperienceYears),
        previousStartupExperience: typeof t.previousStartupExperience === "boolean" ? t.previousStartupExperience : undefined,
        linkedin: normalizeLinkedInUrl(t.linkedin),
      })));
    }

    const rounds = arr<Record<string, unknown>>(p.rounds);
    if (rounds.length) {
      await manager.getRepository(FundingRound).save(rounds.map((r) => manager.getRepository(FundingRound).create({
        startupId: startup.id, round: str(r.round), date: str(r.date), amount: num(r.amount), lead: str(r.lead),
      })));
    }

    const products = arr<Record<string, unknown>>(p.products);
    if (products.length) {
      await manager.getRepository(ProductRef).save(products.map((x) => manager.getRepository(ProductRef).create({
        entityType: EntityKind.STARTUP, entityId: startup.id, name: str(x.name), category: str(x.category), description: str(x.description),
      })));
    }

    const docNames = strArr(p.documentChecklist);
    if (docNames.length) {
      await manager.getRepository(DocumentRef).save(docNames.map((n) => manager.getRepository(DocumentRef).create({
        entityType: EntityKind.STARTUP, entityId: startup.id, name: n, onFile: false,
      })));
    }

    await manager.getRepository(Contact).save(manager.getRepository(Contact).create({
      entityType: EntityKind.STARTUP, entityId: startup.id,
      mainContact: str(p.contactName), email: str(p.contactEmail, str(p.email)), phone: str(p.contactPhone, str(p.phone)), linkedin: str(p.contactLinkedin),
    }));

    const sectorNames = [str(p.category)].concat(strArr(p.additionalSectors)).filter(Boolean);
    await linkSectors(manager, EntityKind.STARTUP, startup.id, sectorNames);

    return startup.id;
  }
}

const SCORING_NUMERIC_KEYS: (keyof ScoringFeatures)[] = [
  "annualRevenue", "previousAnnualRevenue", "quarterlyRevenueGrowth", "customerCount", "previousCustomerCount", "customerGrowthRate",
  "partnershipsCount", "partnershipGrowth", "employeeGrowth", "geographicExpansion", "activeUsers", "userGrowthRate",
  "monthlyBurn", "cashAvailable", "runwayMonths", "recurringRevenue", "totalFundingRaised", "fundingRounds", "investorCount", "debt", "grossMargin", "burnMultiple",
  "tam", "sam", "som", "marketGrowthRate", "cagr", "competitionLevel", "geographicReach", "saudiMarketOpportunity", "menaMarketOpportunity", "categoryTailwinds",
  "founderCount", "founderExperienceYears", "healthcareExperienceYears", "technicalExperienceYears", "commercialExperienceYears", "previousExits",
  "publications", "patents", "teamSize", "leadershipCompleteness", "technicalTeamStrength", "commercialTeamStrength",
  "patentsGranted", "patentsPending", "proprietaryDatasets", "proprietaryAlgorithms", "peerReviewedPublications", "tradeSecrets",
  "technicalComplexity", "replicationDifficulty",
];
const SCORING_BOOLEAN_KEYS: (keyof ScoringFeatures)[] = ["previousStartupExperience", "clinicalData", "clinicalValidation", "proprietaryTechnology"];

/** Pulls whatever of the structured scoring-input field names a submission's
 * payload carries — some collected directly on the wizard (Team/Funding/
 * Market/Regulatory/Product steps), some only ever populated via AI
 * Autofill's extraction — into two ScoringFeatures partials, split by
 * whether the key is still in `aiFilledKeys` (untouched AI extraction) or
 * not (the founder typed it, or edited over what AI put there). Called by
 * SubmissionsService.approve() *after* the publish transaction commits, so
 * it never runs against an uncommitted startup id. Never invents a value: a
 * field simply absent from the payload is left out of the result rather
 * than defaulted. */
export function extractStartupScoringFeatures(p: Record<string, unknown>, aiFilledKeys: Set<string> = new Set()): { founderPatch: Partial<ScoringFeatures>; aiPatch: Partial<ScoringFeatures> } {
  const founderPatch: Partial<ScoringFeatures> = {};
  const aiPatch: Partial<ScoringFeatures> = {};
  const assign = (key: keyof ScoringFeatures, value: ScoringFeatures[keyof ScoringFeatures], sourceKey: string = key): void => {
    const target = (aiFilledKeys.has(sourceKey) ? aiPatch : founderPatch) as Record<string, unknown>;
    target[key] = value;
  };

  for (const key of SCORING_NUMERIC_KEYS) {
    const v = numOrUndefined(p[key]);
    if (v !== undefined) assign(key, v);
  }
  for (const key of SCORING_BOOLEAN_KEYS) {
    if (typeof p[key] === "boolean") assign(key, p[key] as boolean);
  }
  if (typeof p.regulatoryMilestone === "string" && p.regulatoryMilestone) assign("regulatoryMilestone", p.regulatoryMilestone);

  // "Employees" (a required wizard field) is the company's headcount, which is exactly what the `teamSize` input means. Only a positive
  // figure counts as evidence: 0 is how an unanswered form looks, so it is not turned into "a team of zero".
  const headcount = numOrUndefined(p.employees);
  if (p.teamSize === undefined && headcount !== undefined && headcount > 0) assign("teamSize", headcount, "employees");

  // Markets Currently Operating In (Market step, chips of COUNTRIES) isn't a
  // ScoringFeatures key itself — its array length is the signal.
  if (Array.isArray(p.marketsOperatingIn) && p.marketsOperatingIn.length) {
    assign("geographicExpansion", p.marketsOperatingIn.length, "marketsOperatingIn");
  }

  // Technology Readiness Level is a friendly-label select in the wizard
  // (Field.tsx selects always write a string), resolved back to the
  // engine's expected 1-9 here — see trl-labels.ts.
  if (typeof p.technologyReadinessLevel === "string") {
    const level = trlLevelForLabel(p.technologyReadinessLevel);
    if (level !== undefined) assign("technologyReadinessLevel", level);
  }

  return { founderPatch, aiPatch };
}

/** Shared by every publisher: resolve/create Sector rows and link them —
 * same behavior as DirectorySharedService.setSectors(), reimplemented
 * against the transactional manager since that service isn't manager-aware. */
export async function linkSectors(manager: EntityManager, entityType: EntityKind, entityId: string, names: string[]): Promise<void> {
  const sectorRepo = manager.getRepository(Sector);
  const linkRepo = manager.getRepository(EntitySector);
  for (const name of Array.from(new Set(names.filter(Boolean)))) {
    let sector = await sectorRepo.findOne({ where: { name } });
    if (!sector) sector = await sectorRepo.save(sectorRepo.create({ name }));
    await linkRepo.save(linkRepo.create({ entityType, entityId, sectorId: sector.id }));
  }
}
