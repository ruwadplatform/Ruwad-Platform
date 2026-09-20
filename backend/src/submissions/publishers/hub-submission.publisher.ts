import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { Hub } from "../../hubs/hub.entity";
import { HubProgram } from "../../hubs/hub-program.entity";
import { HubPortfolioItem } from "../../hubs/hub-portfolio-item.entity";
import { Partnership } from "../../directory-shared/partnership.entity";
import { DocumentRef } from "../../directory-shared/document-ref.entity";
import { Contact } from "../../directory-shared/contact.entity";
import { EntityKind } from "../../common/enums";
import { uniqueSlugFor } from "../../common/slug.util";
import { SubmissionPublisher, arr, num, str, strArr } from "./publisher.types";
import { linkSectors } from "./startup-submission.publisher";
import { hubTypeDetails, normalizeHubPayload, typeHasRule } from "../hub-types";

@Injectable()
export class HubSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.HUB;

  async publish(manager: EntityManager, raw: Record<string, unknown>): Promise<string> {
    // Older drafts stored funding as free text; map it before reading.
    const p = normalizeHubPayload(raw);
    const hubs = manager.getRepository(Hub);
    const slug = await uniqueSlugFor((s) => hubs.findOne({ where: { slug: s } }), str(p.name, "untitled-hub"));
    const type = str(p.type);

    // Stage vocabulary lives under a different key per type; expose whichever
    // applies through the one filterable column.
    const stages = strArr(p.stagesSupported).length ? strArr(p.stagesSupported)
      : strArr(p.ventureStages).length ? strArr(p.ventureStages) : strArr(p.startupStagesAccepted);

    const hasFunding = typeof p.hasFunding === "boolean" ? p.hasFunding : null;
    const fundingAvailable = hasFunding === true ? (str(p.fundingAmount).trim() || "Available")
      : hasFunding === false ? "None" : str(p.fundingAvailable, "Undisclosed");

    const hub = await hubs.save(hubs.create({
      slug,
      name: str(p.name), logoImageId: str(p.logoImageId) || undefined,
      type, city: str(p.city), country: str(p.country),
      founded: Number(p.founded) || new Date().getFullYear(), website: str(p.website),
      operatingRegion: str(p.operatingRegion, str(p.country)), ownershipType: str(p.ownershipType, "Private"),
      status: typeHasRule(type, "status") && p.status === "Closed" ? "Closed" : "Open",
      deadline: typeHasRule(type, "deadline") ? str(p.deadline, "Rolling") : "N/A",
      desc: str(p.desc), about: str(p.about, str(p.desc)),
      stagesSupported: stages, geographicCoverage: strArr(p.geographicCoverage),
      support: strArr(p.support), fundingAvailable,
      fundingType: hasFunding === false ? "N/A" : str(p.fundingType, "N/A"),
      hasFunding,
      typeDetails: hubTypeDetails(p),
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      focusAreas: strArr(p.focusAreas),
      eligibility: p.eligibility && typeof p.eligibility === "object" ? (p.eligibility as Hub["eligibility"]) : undefined,
      application: p.application && typeof p.application === "object" ? (p.application as Hub["application"]) : undefined,
    }));

    // Only the sections the selected type actually has — leftovers from a
    // previously chosen type in the draft are never published.
    const programs = typeHasRule(type, "programs") ? arr<Record<string, unknown>>(p.programs) : [];
    if (programs.length) {
      await manager.getRepository(HubProgram).save(programs.map((prog) => manager.getRepository(HubProgram).create({
        hubId: hub.id, name: str(prog.name), type: str(prog.type), status: str(prog.status, "Open"),
        duration: str(prog.duration), location: str(prog.location, str(p.city)), format: str(prog.format),
        deadline: str(prog.deadline, "Rolling"), cohortSize: str(prog.cohortSize),
      })));
    }

    const portfolio = typeHasRule(type, "venturePortfolio") ? arr<Record<string, unknown>>(p.venturePortfolio) : [];
    if (portfolio.length) {
      await manager.getRepository(HubPortfolioItem).save(portfolio.map((x) => manager.getRepository(HubPortfolioItem).create({
        hubId: hub.id, companyName: str(x.companyName), sector: str(x.sector), stage: str(x.stage, "Unspecified"),
        location: str(p.city), programName: str(p.name), year: num(x.yearCreated, new Date().getFullYear()),
      })));
    }

    const partnerships = typeHasRule(type, "partnerships") ? arr<Record<string, unknown>>(p.partnerships) : [];
    if (partnerships.length) {
      await manager.getRepository(Partnership).save(partnerships.map((x) => manager.getRepository(Partnership).create({
        entityType: EntityKind.HUB, entityId: hub.id, type: str(x.type), partnerName: str(x.partner ?? x.partnerName), description: str(x.description ?? x.desc),
      })));
    }

    const docNames = strArr(p.documentChecklist);
    if (docNames.length) {
      await manager.getRepository(DocumentRef).save(docNames.map((n) => manager.getRepository(DocumentRef).create({
        entityType: EntityKind.HUB, entityId: hub.id, name: n, onFile: false,
      })));
    }

    await manager.getRepository(Contact).save(manager.getRepository(Contact).create({
      entityType: EntityKind.HUB, entityId: hub.id,
      mainContact: str(p.contactName), email: str(p.contactEmail), phone: str(p.contactPhone), website: str(p.website), linkedin: str(p.contactLinkedin),
      extra: { hq: str(p.city), applicationLink: str(p.applicationUrl) },
    }));

    await linkSectors(manager, EntityKind.HUB, hub.id, strArr(p.healthcareFocus));

    return hub.id;
  }
}
