import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { Hub } from "../../hubs/hub.entity";
import { HubProgram } from "../../hubs/hub-program.entity";
import { Partnership } from "../../directory-shared/partnership.entity";
import { DocumentRef } from "../../directory-shared/document-ref.entity";
import { Contact } from "../../directory-shared/contact.entity";
import { EntityKind } from "../../common/enums";
import { uniqueSlugFor } from "../../common/slug.util";
import { SubmissionPublisher, arr, str, strArr } from "./publisher.types";
import { linkSectors } from "./startup-submission.publisher";

@Injectable()
export class HubSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.HUB;

  async publish(manager: EntityManager, p: Record<string, unknown>): Promise<string> {
    const hubs = manager.getRepository(Hub);
    const slug = await uniqueSlugFor((s) => hubs.findOne({ where: { slug: s } }), str(p.name, "untitled-hub"));

    const hub = await hubs.save(hubs.create({
      slug,
      name: str(p.name), logoImageId: str(p.logoImageId) || undefined,
      type: str(p.type), city: str(p.city), country: str(p.country),
      founded: Number(p.founded) || new Date().getFullYear(), website: str(p.website),
      operatingRegion: str(p.operatingRegion, str(p.country)), ownershipType: str(p.ownershipType, "Private"),
      status: (p.status === "Closed" ? "Closed" : "Open"), deadline: str(p.deadline, "Rolling"),
      desc: str(p.desc), about: str(p.about, str(p.desc)),
      stagesSupported: strArr(p.stagesSupported), geographicCoverage: strArr(p.geographicCoverage),
      support: strArr(p.support), fundingAvailable: str(p.fundingAvailable, "Undisclosed"), fundingType: str(p.fundingType, "N/A"),
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      focusAreas: strArr(p.focusAreas),
      eligibility: p.eligibility && typeof p.eligibility === "object" ? (p.eligibility as Hub["eligibility"]) : undefined,
      application: p.application && typeof p.application === "object" ? (p.application as Hub["application"]) : undefined,
    }));

    const programs = arr<Record<string, unknown>>(p.programs);
    if (programs.length) {
      await manager.getRepository(HubProgram).save(programs.map((prog) => manager.getRepository(HubProgram).create({
        hubId: hub.id, name: str(prog.name), type: str(prog.type), status: str(prog.status, "Open"),
        duration: str(prog.duration), location: str(prog.location, str(p.city)), format: str(prog.format),
        deadline: str(prog.deadline, "Rolling"), cohortSize: str(prog.cohortSize),
      })));
    }

    const partnerships = arr<Record<string, unknown>>(p.partnerships);
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
