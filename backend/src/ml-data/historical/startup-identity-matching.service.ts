import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { STARTUP_CATEGORIES } from "./startup-categories";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Startup } from "../../startups/startup.entity";
import { StartupExternalIdentity } from "./startup-external-identity.entity";
import { FoundedYearBasis, IdentityMatchedBy, IdentityMatchStatus } from "../../common/enums";
import { nameSimilarity, normalizeCompanyName, normalizeDomain } from "./name-matching.util";
import { uniqueSlugFor } from "../../common/slug.util";

export interface CreateStartupForIdentityInput {
  category: string;
  subsector: string;
  country: string;
  founded: number;
  stage: string;
  tagline?: string;
}

const FUZZY_REVIEW_THRESHOLD = 0.82;

export interface IdentityCandidateInput {
  startupName: string;
  startupDomain?: string;
  country?: string;
  externalId?: string;
  sourceName: string;
}

export interface MatchCandidate {
  startupId?: string;
  matchedBy?: IdentityMatchedBy;
  matchStatus: IdentityMatchStatus;
  matchConfidence?: number;
}

/** The match waterfall from the task spec, exact order: exact external ID
 * > exact domain > verified alias > normalized name+country > fuzzy name
 * (always REVIEW_REQUIRED). Never merges two Startup rows on a fuzzy match
 * alone — matchCandidate() is pure/read-only, used by both dry-run
 * (report only) and commit (report + persist via resolveAndPersist). */
@Injectable()
export class StartupIdentityMatchingService {
  private readonly logger = new Logger(StartupIdentityMatchingService.name);

  constructor(
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(StartupExternalIdentity) private readonly identities: Repository<StartupExternalIdentity>,
  ) {}

  async matchCandidate(input: IdentityCandidateInput): Promise<MatchCandidate> {
    // Tier 1: exact external ID, previously confirmed for this source.
    if (input.externalId) {
      const known = await this.identities.findOne({ where: { sourceName: input.sourceName, externalId: input.externalId } });
      if (known?.startupId) return { startupId: known.startupId, matchedBy: IdentityMatchedBy.EXTERNAL_ID, matchStatus: IdentityMatchStatus.MATCHED, matchConfidence: 1 };
    }

    // Tier 2: exact normalized domain against Startup.website.
    if (input.startupDomain) {
      const domain = normalizeDomain(input.startupDomain);
      const all = await this.startups.find();
      const byDomain = all.find((s) => s.website && normalizeDomain(s.website) === domain);
      if (byDomain) return { startupId: byDomain.id, matchedBy: IdentityMatchedBy.DOMAIN, matchStatus: IdentityMatchStatus.MATCHED, matchConfidence: 1 };
    }

    // Tier 3: verified alias — an admin already confirmed this exact
    // source-name-at-source maps to a startup.
    const normalizedInputName = normalizeCompanyName(input.startupName);
    const verifiedAlias = await this.identities.findOne({ where: { sourceName: input.sourceName, companyNameAtSource: input.startupName, verified: true } });
    if (verifiedAlias?.startupId) return { startupId: verifiedAlias.startupId, matchedBy: IdentityMatchedBy.ALIAS, matchStatus: IdentityMatchStatus.MATCHED, matchConfidence: 1 };

    // Tier 4: normalized name (+ country when given). Exactly one
    // candidate -> matched; more than one -> ambiguous, needs review.
    const all = await this.startups.find();
    const nameMatches = all.filter((s) => normalizeCompanyName(s.name) === normalizedInputName && (!input.country || s.country?.toLowerCase() === input.country.toLowerCase()));
    if (nameMatches.length === 1) return { startupId: nameMatches[0].id, matchedBy: IdentityMatchedBy.NORMALIZED_NAME, matchStatus: IdentityMatchStatus.MATCHED, matchConfidence: 0.95 };
    if (nameMatches.length > 1) return { matchStatus: IdentityMatchStatus.POSSIBLE_DUPLICATE, matchConfidence: 0.95 };

    // Tier 5: fuzzy — always requires review, never auto-applied.
    let best: { startup: Startup; score: number } | null = null;
    for (const s of all) {
      const score = nameSimilarity(input.startupName, s.name);
      if (score >= FUZZY_REVIEW_THRESHOLD && (!best || score > best.score)) best = { startup: s, score };
    }
    if (best) return { startupId: best.startup.id, matchedBy: IdentityMatchedBy.FUZZY_REVIEW, matchStatus: IdentityMatchStatus.REVIEW_REQUIRED, matchConfidence: best.score };

    return { matchStatus: IdentityMatchStatus.UNMATCHED };
  }

  /** Writes (or updates) the startup_external_identities row for one
   * (sourceName, externalId ?? companyNameAtSource) pair — idempotent, so
   * re-running an import batch never creates duplicate identity rows. */
  async resolveAndPersist(input: IdentityCandidateInput): Promise<StartupExternalIdentity> {
    const match = await this.matchCandidate(input);
    const where = input.externalId
      ? { sourceName: input.sourceName, externalId: input.externalId }
      : { sourceName: input.sourceName, companyNameAtSource: input.startupName };
    let row = await this.identities.findOne({ where });
    if (!row) row = this.identities.create({ sourceName: input.sourceName, externalId: input.externalId, companyNameAtSource: input.startupName, domain: input.startupDomain });
    if (match.matchStatus === IdentityMatchStatus.MATCHED) {
      row.startupId = match.startupId;
    }
    row.matchedBy = match.matchedBy;
    row.matchStatus = match.matchStatus;
    row.matchConfidence = match.matchConfidence;
    return this.identities.save(row);
  }

  /** Every identity row still awaiting an admin decision — the exact set
   * the match-review page lists, each with its real id so confirm/reject/
   * create-startup can act on it directly. */
  listNeedingReview(): Promise<StartupExternalIdentity[]> {
    return this.identities.find({
      where: [
        { matchStatus: IdentityMatchStatus.UNMATCHED },
        { matchStatus: IdentityMatchStatus.REVIEW_REQUIRED },
        { matchStatus: IdentityMatchStatus.POSSIBLE_DUPLICATE },
      ],
    });
  }

  /** Admin explicitly confirms a suggested (or previously ambiguous) match
   * — never automatic. Also marks the identity "verified" so future
   * imports referencing the same external record auto-match at the ALIAS
   * tier without re-review. */
  async confirmMatch(identityId: string, startupId: string, _adminUserId: string): Promise<StartupExternalIdentity> {
    const row = await this.identities.findOne({ where: { id: identityId } });
    if (!row) throw new NotFoundException(`Unknown identity row ${identityId}`);
    const startup = await this.startups.findOne({ where: { id: startupId } });
    if (!startup) throw new NotFoundException(`Unknown startup ${startupId}`);
    row.startupId = startupId;
    row.matchedBy = IdentityMatchedBy.MANUAL;
    row.matchStatus = IdentityMatchStatus.MATCHED;
    row.matchConfidence = 1;
    row.verified = true;
    return this.identities.save(row);
  }

  async rejectMatch(identityId: string): Promise<StartupExternalIdentity> {
    const row = await this.identities.findOne({ where: { id: identityId } });
    if (!row) throw new NotFoundException(`Unknown identity row ${identityId}`);
    row.startupId = undefined;
    row.matchStatus = IdentityMatchStatus.UNMATCHED;
    return this.identities.save(row);
  }

  /** Side-effect-free category correction for a startup this pipeline
   * created. Deliberately a single-column repository update: it does NOT go
   * through StartupsService.update(), which re-runs scoring and can write a
   * live ML snapshot dated "now". Nothing here touches scoring, snapshots or
   * history; the category must be one of the supported STARTUP_CATEGORIES. */
  async correctStartupCategory(startupId: string, category: string, reason: string): Promise<Startup> {
    if (!(STARTUP_CATEGORIES as readonly string[]).includes(category)) throw new BadRequestException(`"${category}" is not a supported startup category.`);
    const startup = await this.startups.findOne({ where: { id: startupId } });
    if (!startup) throw new NotFoundException(`Unknown startup ${startupId}`);
    const previous = startup.category;
    if (previous === category) return startup;
    await this.startups.update({ id: startupId }, { category });
    this.logger.log(`Startup ${startupId} category corrected "${previous}" -> "${category}": ${reason}`);
    return { ...startup, category };
  }

  /** Data-maintenance only: records whether `founded` is a stated year, an
   * estimate (an upper-bound placeholder such as the earliest financing year) or
   * unknown. Single-column update — the year itself, scoring, snapshots and
   * history are untouched. */
  async correctFoundedBasis(startupId: string, basis: FoundedYearBasis, reason: string): Promise<Startup> {
    const startup = await this.startups.findOne({ where: { id: startupId } });
    if (!startup) throw new NotFoundException(`Unknown startup ${startupId}`);
    if (startup.foundedBasis === basis) return startup;
    await this.startups.update({ id: startupId }, { foundedBasis: basis });
    this.logger.log(`Startup ${startupId} founding-year basis ${startup.foundedBasis} -> ${basis}: ${reason}`);
    return { ...startup, foundedBasis: basis };
  }

  /** "Create New Startup" from the match-review UI — deliberately requires
   * the admin to supply the handful of fields RUWĀD's schema treats as
   * required (category/subsector/country/founded/stage) rather than
   * guessing them; only the identity fields already known from the CSV
   * row (name, website, registration placeholder) are filled
   * automatically. Mirrors StartupSubmissionPublisher's own
   * neutral-placeholder convention for every other required-but-unknown
   * field, but tags verified:"unclaimed" (never "self-reported" — nobody
   * affiliated with the company is submitting this) and a distinct
   * provenance note. */
  async createStartupForIdentity(identityId: string, input: CreateStartupForIdentityInput, adminUserId: string): Promise<Startup> {
    const identity = await this.identities.findOne({ where: { id: identityId } });
    if (!identity) throw new NotFoundException(`Unknown identity row ${identityId}`);
    if (identity.startupId) throw new BadRequestException(`Identity row ${identityId} is already matched to a startup`);

    const slug = await uniqueSlugFor((s) => this.startups.findOne({ where: { slug: s } }), identity.companyNameAtSource);
    const startup = await this.startups.save(this.startups.create({
      slug, name: identity.companyNameAtSource, category: input.category, subsector: input.subsector,
      tagline: input.tagline ?? identity.companyNameAtSource, country: input.country, city: "", hq: input.country,
      founded: input.founded, stage: input.stage, status: "Active", businessModel: "", employees: 0,
      fundingTotal: 0, valuation: 0, fundraising: false, desc: "", problem: "", solution: "", advantage: "",
      sfda: "Not Submitted", fda: "N/A", ce: "N/A", clinicalStatus: "Not disclosed", patentStatus: "Not disclosed",
      marketTam: "", marketSam: "", marketSom: "", marketCompetitors: [],
      legalName: identity.companyNameAtSource, formerName: "—", website: identity.domain ?? "", email: "", phone: "", linkedin: "",
      registrationNumber: `HIST-${Math.floor(100000 + Math.random() * 899999)}`,
      verified: "unclaimed",
      provenanceConfidence: "Low", provenanceLastUpdated: new Date().toISOString().slice(0, 10),
      provenanceSources: [`Historical data import (${identity.sourceName}) — created by admin ${adminUserId}`],
      newsItems: [],
    }));

    identity.startupId = startup.id;
    identity.matchedBy = IdentityMatchedBy.MANUAL;
    identity.matchStatus = IdentityMatchStatus.MATCHED;
    identity.matchConfidence = 1;
    identity.verified = true;
    await this.identities.save(identity);
    return startup;
  }
}
