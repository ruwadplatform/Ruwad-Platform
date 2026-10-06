import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Startup } from "./startup.entity";
import { FundingRound } from "./funding-round.entity";
import { CreateStartupDto } from "./dto/create-startup.dto";
import { TeamMember } from "../directory-shared/team-member.entity";
import { ProductRef } from "../directory-shared/product.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { Contact } from "../directory-shared/contact.entity";
import { EntitySector } from "../directory-shared/entity-sector.entity";
import { Sector } from "../directory-shared/sector.entity";
import { Submission } from "../submissions/submission.entity";
import { extractStartupScoringFeatures, linkSectors } from "../submissions/publishers/startup-submission.publisher";
import { arr, bool, num, numOrUndefined, str, strArr } from "../submissions/publishers/publisher.types";
import { ActivityType, EntityKind, ScoreTrigger, ScoringBasis, StartupOutcomeEventType, SubmissionStatus } from "../common/enums";
import { ScoringService } from "../scoring/scoring.service";
import { TRL_LABELS } from "../scoring/trl-labels";
import type { ScoringFeatures } from "../scoring/scoring.types";
import { OutcomeEventsService } from "../ml-data/outcome-events.service";
import { ActivityService } from "../activity/activity.service";

type Payload = Record<string, unknown>;

/** Startup columns the edit form writes, copied as-is when present. */
const TEXT_COLUMNS = ["name", "category", "subsector", "tagline", "country", "city", "hq", "stage", "status", "businessModel", "desc", "problem", "solution", "advantage",
  "sfda", "fda", "ce", "clinicalStatus", "patentStatus", "marketTam", "marketSam", "marketSom", "legalName", "website", "email", "phone", "linkedin", "targetRaise"] as const;
const NUMBER_COLUMNS = ["founded", "employees", "fundingTotal", "valuation"] as const;

/** Scoring inputs the form shows. Only these can be set by an owner edit: system-derived inputs (team size from the roster, number of
 * rounds, investor count, ...) are recomputed from the profile's own rows and must never be pinned as "founder reported". */
const FEATURE_NUMBER_KEYS = ["annualRevenue", "previousAnnualRevenue", "recurringRevenue", "customerCount", "previousCustomerCount", "activeUsers", "partnershipsCount",
  "monthlyBurn", "cashAvailable", "marketGrowthRate", "proprietaryAlgorithms", "proprietaryDatasets", "peerReviewedPublications", "patentsGranted", "patentsPending"] as const;
const FEATURE_BOOLEAN_KEYS = ["proprietaryTechnology", "clinicalValidation"] as const;
const FEATURE_PASSTHROUGH = ["regulatoryMilestone", "technologyReadinessLevel", "marketsOperatingIn", "employees"] as const;

const EDIT_KEYS = new Set<string>([
  ...TEXT_COLUMNS, ...NUMBER_COLUMNS, ...FEATURE_NUMBER_KEYS, ...FEATURE_BOOLEAN_KEYS, ...FEATURE_PASSTHROUGH,
  "logoImageId", "formerName", "fundraising", "marketCompetitors", "additionalSectors", "founders", "products", "rounds", "documentChecklist",
  "contactName", "contactEmail", "contactPhone", "contactLinkedin",
]);

/** An owner may leave anything else empty (the point of editing is to add information over time) but a listing needs these to be shown at all. */
const CORE_REQUIRED: [string, string][] = [["name", "Company name"], ["category", "Healthcare category"], ["tagline", "Tagline"], ["country", "Country"], ["city", "City"], ["stage", "Stage"]];

export interface StartupEditResult {
  /** Scoring inputs the owner changed that a verified or admin-entered value currently outranks; the old value stays and is not an error. */
  lockedFields: string[];
}

/** Lets the owner (or an admin) edit an already-live startup in place, using the same field names as the submission wizard.
 * Saving applies the change immediately and then runs the normal automatic pipeline (derive features -> rescore -> experimental ML estimate),
 * so the RUWĀD Score and the ML estimate always reflect whatever information is on file, however much that is. Changes are never routed back
 * through admin review: the startup stays live throughout. */
@Injectable()
export class StartupProfileEditService {
  private readonly logger = new Logger(StartupProfileEditService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly scoring: ScoringService,
    private readonly outcomeEvents: OutcomeEventsService,
    private readonly activity: ActivityService,
  ) {}

  /** The current profile in wizard-payload shape. The original approved submission (when there is one) supplies answers the profile does not
   * store as columns (e.g. markets operating in); everything the platform stores now overrides it. */
  async getEditPayload(startupId: string): Promise<Payload> {
    const startup = await this.startups.findOneOrFail({ where: { id: startupId } });
    const approved = await this.submissions.findOne({ where: { publishedEntityId: startupId, status: SubmissionStatus.APPROVED }, order: { updatedAt: "DESC" } });
    const base: Payload = { ...(approved?.payload ?? {}) };
    delete base.aiFilledScoringKeys;
    delete base.teamMembers;

    const m = this.dataSource.manager;
    const [team, rounds, products, contact, docs, sectorRows, features] = await Promise.all([
      m.find(TeamMember, { where: { entityType: EntityKind.STARTUP, entityId: startupId }, order: { createdAt: "ASC" } }),
      m.find(FundingRound, { where: { startupId }, order: { createdAt: "ASC" } }),
      m.find(ProductRef, { where: { entityType: EntityKind.STARTUP, entityId: startupId }, order: { createdAt: "ASC" } }),
      m.findOne(Contact, { where: { entityType: EntityKind.STARTUP, entityId: startupId } }),
      m.find(DocumentRef, { where: { entityType: EntityKind.STARTUP, entityId: startupId } }),
      m.createQueryBuilder(EntitySector, "es").innerJoin(Sector, "s", "s.id = es.sectorId").select("s.name", "name").where("es.entityType = :t AND es.entityId = :id", { t: EntityKind.STARTUP, id: startupId }).getRawMany<{ name: string }>(),
      this.scoring.getFeatures(startupId),
    ]);

    const out: Payload = { ...base };
    const row = startup as unknown as Record<string, unknown>;
    for (const k of TEXT_COLUMNS) out[k] = row[k] ?? "";
    for (const k of NUMBER_COLUMNS) out[k] = row[k] === null || row[k] === undefined ? undefined : Number(row[k]);
    out.logoImageId = startup.logoImageId ?? undefined;
    out.formerName = startup.formerName && startup.formerName !== "—" ? startup.formerName : "";
    out.fundraising = !!startup.fundraising;
    out.marketCompetitors = startup.marketCompetitors ?? [];
    out.founders = team.map((t) => ({
      name: t.name, title: t.title, isFounder: !!t.isFounder,
      experienceYears: t.experienceYears ?? undefined, healthcareExperienceYears: t.healthcareExperienceYears ?? undefined, previousStartupExperience: t.previousStartupExperience ?? undefined,
    }));
    out.rounds = rounds.map((r) => ({ round: r.round, date: r.date, amount: Number(r.amount), lead: r.lead }));
    out.products = products.map((p) => ({ name: p.name, category: p.category, description: p.description }));
    out.documentChecklist = docs.map((d) => d.name);
    out.additionalSectors = sectorRows.map((s) => s.name).filter((n) => n !== startup.category);
    if (contact) {
      out.contactName = contact.mainContact ?? "";
      out.contactEmail = contact.email ?? "";
      out.contactPhone = contact.phone ?? "";
      out.contactLinkedin = contact.linkedin ?? "";
    }

    // Scoring inputs on file win over whatever the original submission said.
    const stored = features.features as Record<string, unknown>;
    for (const k of [...FEATURE_NUMBER_KEYS, ...FEATURE_BOOLEAN_KEYS, "regulatoryMilestone"]) if (stored[k] !== undefined && stored[k] !== null) out[k] = stored[k];
    const trl = numOrUndefined(stored.technologyReadinessLevel);
    if (trl !== undefined && TRL_LABELS[trl - 1]) out.technologyReadinessLevel = TRL_LABELS[trl - 1];

    // Only keys the form can edit leave the server; the rest of a stored submission (AI tags, internal flags) stays behind.
    return Object.fromEntries(Object.entries(out).filter(([k, v]) => EDIT_KEYS.has(k) && v !== undefined && v !== null));
  }

  async applyEdit(startupId: string, userId: string, raw: Payload): Promise<StartupEditResult> {
    const startup = await this.startups.findOneOrFail({ where: { id: startupId } });
    const p = normalise(raw);
    await this.assertValid(p, startup);

    await this.dataSource.transaction(async (manager) => {
      const patch: Record<string, unknown> = {};
      for (const k of TEXT_COLUMNS) if (p[k] !== undefined) patch[k] = str(p[k]);
      for (const k of NUMBER_COLUMNS) if (p[k] !== undefined) patch[k] = num(p[k]);
      if (p.logoImageId !== undefined) patch.logoImageId = str(p.logoImageId) || null;
      if (p.formerName !== undefined) patch.formerName = str(p.formerName) || "—";
      if (p.fundraising !== undefined) patch.fundraising = bool(p.fundraising);
      if (p.marketCompetitors !== undefined) patch.marketCompetitors = strArr(p.marketCompetitors);
      if (p.targetRaise !== undefined && !patch.targetRaise) patch.targetRaise = null;
      // A startup published under the old "needs 4 factors at 50% confidence" rule would stay unscored after an edit; once its owner is
      // adding information it is scored on whatever is on file, like every new startup.
      if (startup.scoringBasis !== ScoringBasis.EXISTING_DATA) patch.scoringBasis = ScoringBasis.EXISTING_DATA;
      patch.provenanceLastUpdated = new Date().toISOString().slice(0, 10);
      await manager.getRepository(Startup).update(startupId, patch as never);

      if (p.founders !== undefined) {
        await manager.delete(TeamMember, { entityType: EntityKind.STARTUP, entityId: startupId });
        const members = arr<Payload>(p.founders).filter((t) => str(t.name).trim());
        if (members.length) {
          await manager.save(TeamMember, members.map((t) => manager.create(TeamMember, {
            entityType: EntityKind.STARTUP, entityId: startupId, name: str(t.name).trim(), title: str(t.title).trim(), isFounder: bool(t.isFounder),
            experienceYears: numOrUndefined(t.experienceYears), healthcareExperienceYears: numOrUndefined(t.healthcareExperienceYears),
            previousStartupExperience: typeof t.previousStartupExperience === "boolean" ? t.previousStartupExperience : undefined,
          })));
        }
      }
      if (p.rounds !== undefined) {
        await manager.delete(FundingRound, { startupId });
        const rounds = arr<Payload>(p.rounds).filter((r) => str(r.round).trim());
        if (rounds.length) await manager.save(FundingRound, rounds.map((r) => manager.create(FundingRound, { startupId, round: str(r.round), date: str(r.date), amount: num(r.amount), lead: str(r.lead) })));
      }
      if (p.products !== undefined) {
        await manager.delete(ProductRef, { entityType: EntityKind.STARTUP, entityId: startupId });
        const products = arr<Payload>(p.products).filter((x) => str(x.name).trim());
        if (products.length) await manager.save(ProductRef, products.map((x) => manager.create(ProductRef, { entityType: EntityKind.STARTUP, entityId: startupId, name: str(x.name), category: str(x.category), description: str(x.description) })));
      }
      if (p.documentChecklist !== undefined) {
        // Keep the "on file" state of documents that stay on the list; only added names start as not provided.
        const wanted = new Set(strArr(p.documentChecklist));
        const existing = await manager.find(DocumentRef, { where: { entityType: EntityKind.STARTUP, entityId: startupId } });
        for (const d of existing) if (!wanted.has(d.name)) await manager.delete(DocumentRef, d.id);
        const have = new Set(existing.map((d) => d.name));
        for (const name of wanted) if (!have.has(name)) await manager.save(DocumentRef, manager.create(DocumentRef, { entityType: EntityKind.STARTUP, entityId: startupId, name, onFile: false }));
      }
      if (["contactName", "contactEmail", "contactPhone", "contactLinkedin"].some((k) => p[k] !== undefined)) {
        let contact = await manager.findOne(Contact, { where: { entityType: EntityKind.STARTUP, entityId: startupId } });
        if (!contact) contact = manager.create(Contact, { entityType: EntityKind.STARTUP, entityId: startupId });
        if (p.contactName !== undefined) contact.mainContact = str(p.contactName);
        if (p.contactEmail !== undefined) contact.email = str(p.contactEmail);
        if (p.contactPhone !== undefined) contact.phone = str(p.contactPhone);
        if (p.contactLinkedin !== undefined) contact.linkedin = str(p.contactLinkedin);
        await manager.save(Contact, contact);
      }
      if (p.category !== undefined || p.additionalSectors !== undefined) {
        await manager.delete(EntitySector, { entityType: EntityKind.STARTUP, entityId: startupId });
        await linkSectors(manager, EntityKind.STARTUP, startupId, [str(p.category, startup.category)].concat(strArr(p.additionalSectors)).filter(Boolean));
      }
    });

    // Everything below runs after the commit and never undoes the saved edit (same rule as publishing a submission).
    try {
      for (const r of arr<Payload>(p.rounds)) {
        const amount = num(r.amount, NaN);
        const date = str(r.date);
        if (!date || !Number.isFinite(amount)) continue;
        await this.outcomeEvents.createSystemEventIfNew(startupId, {
          eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: /^\d{4}-\d{2}$/.test(date) ? `${date}-01` : date, valueNumeric: amount, valueText: str(r.round) || undefined,
        });
      }
    } catch (e) {
      this.logger.warn(`Outcome-event derivation failed after editing startup ${startupId}: ${e instanceof Error ? e.message : "unknown error"}`);
    }

    let lockedFields: string[] = [];
    try {
      // Only values that actually changed are written as "founder reported": re-saving an unchanged form must not re-label values that came
      // from a pitch deck, an import or an admin.
      const before = (await this.scoring.getFeatures(startupId)).features as Record<string, unknown>;
      const founderPatch = Object.fromEntries(Object.entries(extractStartupScoringFeatures(p).founderPatch).filter(([k, v]) => before[k] !== v)) as Partial<ScoringFeatures>;
      await this.scoring.assessStartup(startupId, { founderPatch, trigger: ScoreTrigger.STARTUP_UPDATED });
      const stored = (await this.scoring.getFeatures(startupId)).features as Record<string, unknown>;
      lockedFields = (Object.keys(founderPatch) as (keyof ScoringFeatures)[]).filter((k) => k !== "teamSize" && stored[k] !== founderPatch[k]).map(String);
    } catch (e) {
      this.logger.error(`Rescoring failed after editing startup ${startupId}: ${e instanceof Error ? e.message : "unknown error"}`);
    }

    await this.activity.log(userId, ActivityType.LISTING_EDITED, `Updated "${str(p.name, startup.name)}"`, "/workspace/startup").catch(() => undefined);
    return { lockedFields };
  }

  private async assertValid(p: Payload, startup: Startup): Promise<void> {
    const problems: string[] = [];
    for (const [key, label] of CORE_REQUIRED) {
      const v = p[key] !== undefined ? str(p[key]).trim() : str((startup as unknown as Payload)[key]).trim();
      if (!v) problems.push(`${label} is required.`);
    }
    for (const t of arr<Payload>(p.founders)) if (!str(t.name).trim() || !str(t.title).trim()) problems.push("Every team member needs a name and a title.");
    for (const r of arr<Payload>(p.rounds)) if (!str(r.round).trim() || !str(r.date).trim() || !Number.isFinite(Number(r.amount))) problems.push("Every funding round needs a round, a date and an amount.");
    for (const x of arr<Payload>(p.products)) if (!str(x.name).trim()) problems.push("Every product needs a name.");

    // Type and range checks reuse the create DTO's decorators; fields not supplied are not checked.
    const dto = plainToInstance(CreateStartupDto, Object.fromEntries(Object.entries(p).filter(([k, v]) => !(k === "logoImageId" && !v)).filter(([k]) => !["founders", "contactName", "contactEmail", "contactPhone", "contactLinkedin"].includes(k))));
    const errors = await validate(dto, { skipMissingProperties: true, whitelist: false });
    for (const e of errors) problems.push(...Object.values(e.constraints ?? {}));
    for (const k of FEATURE_NUMBER_KEYS) if (p[k] !== undefined && !(Number.isFinite(Number(p[k])) && Number(p[k]) >= 0)) problems.push(`${k} must be a number of 0 or more.`);

    if (problems.length) throw new BadRequestException({ message: Array.from(new Set(problems)), error: "Bad Request", statusCode: 400 });
  }
}

/** Keeps only editable keys and turns "left blank" into "not supplied" for numbers, so clearing a box never writes a made-up 0. */
function normalise(raw: Payload): Payload {
  const out: Payload = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!EDIT_KEYS.has(k) || v === undefined) continue;
    const isNumeric = (NUMBER_COLUMNS as readonly string[]).includes(k) || (FEATURE_NUMBER_KEYS as readonly string[]).includes(k);
    if (isNumeric) {
      if (v === null || v === "") continue;
      const n = typeof v === "number" ? v : Number(v);
      out[k] = n;
    } else if (v === null) {
      if (k === "logoImageId" || k === "targetRaise") out[k] = "";
    } else out[k] = v;
  }
  return out;
}
