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
import { EntityKind } from "../../common/enums";
import { compositeScore, uniqueSlugFor } from "../../common/slug.util";
import { SubmissionPublisher, arr, bool, num, str, strArr } from "./publisher.types";

@Injectable()
export class StartupSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.STARTUP;

  async publish(manager: EntityManager, p: Record<string, unknown>): Promise<string> {
    const startups = manager.getRepository(Startup);
    const slug = await uniqueSlugFor((s) => startups.findOne({ where: { slug: s } }), str(p.name, "untitled-startup"));

    const scores = [70, 70, 70, 70, 70, 70];
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
      scoreGrowth: scores[0], scoreFinancial: scores[1], scoreMarket: scores[2], scoreTeam: scores[3], scoreRegulatory: scores[4], scoreTech: scores[5],
      score: compositeScore(scores),
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      traction: p.traction && typeof p.traction === "object" ? (p.traction as Startup["traction"]) : undefined,
      newsItems: [],
    }));

    const team = arr<Record<string, unknown>>(p.founders).concat(arr<Record<string, unknown>>(p.teamMembers));
    if (team.length) {
      await manager.getRepository(TeamMember).save(team.map((t) => manager.getRepository(TeamMember).create({
        entityType: EntityKind.STARTUP, entityId: startup.id, name: str(t.name), title: str(t.title), isFounder: bool(t.isFounder, true),
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
