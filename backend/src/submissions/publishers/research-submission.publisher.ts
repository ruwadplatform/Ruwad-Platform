import { Injectable } from "@nestjs/common";
import { DeepPartial, EntityManager } from "typeorm";
import { ResearchInstitution } from "../../research/research-institution.entity";
import { ResearchProject, Publication, ResearchTechnology, Researcher } from "../../research/research-child-entities.entity";
import { Partnership } from "../../directory-shared/partnership.entity";
import { EntityKind } from "../../common/enums";
import { uniqueSlugFor } from "../../common/slug.util";
import { SubmissionPublisher, arr, num, str, strArr } from "./publisher.types";
import { linkSectors } from "./startup-submission.publisher";

/** No documents/Data Room relation is ever written here — explicit product
 * rule: Research & Academia listings have no Data Room. */
@Injectable()
export class ResearchSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.RESEARCH;

  async publish(manager: EntityManager, p: Record<string, unknown>): Promise<string> {
    const repo = manager.getRepository(ResearchInstitution);
    const slug = await uniqueSlugFor((s) => repo.findOne({ where: { slug: s } }), str(p.name, "untitled-institution"));

    const data: DeepPartial<ResearchInstitution> = {
      slug,
      name: str(p.name), logoImageId: str(p.logoImageId) || undefined,
      type: str(p.type), city: str(p.city), country: str(p.country),
      founded: Number(p.founded) || new Date().getFullYear(), website: str(p.website),
      numResearchers: num(p.numResearchers), numCenters: num(p.numCenters), numLabs: num(p.numLabs),
      about: str(p.about, str(p.desc)),
      collaborationStatus: (["Open", "Selective", "Closed"].includes(str(p.collaborationStatus)) ? p.collaborationStatus : "Selective") as "Open" | "Selective" | "Closed",
      technologyReadinessLevel: num(p.technologyReadinessLevel, 1), patentsCount: num(p.patentsCount),
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      coreResearchAreas: strArr(p.coreResearchAreas),
      researchCenters: arr(p.researchCenters), facilities: arr(p.facilities),
      clinical: p.clinical && typeof p.clinical === "object" ? (p.clinical as ResearchInstitution["clinical"]) : undefined,
      innovation: p.innovation && typeof p.innovation === "object" ? (p.innovation as ResearchInstitution["innovation"]) : undefined,
      contacts: {
        mainContact: str(p.contactName), researchOffice: str(p.researchOfficeEmail), techTransferOffice: str(p.techTransferEmail),
        industryPartnershipOffice: str(p.industryPartnershipEmail), website: str(p.website), email: str(p.contactEmail),
        phone: str(p.contactPhone), linkedin: str(p.contactLinkedin), location: `${str(p.city)}, ${str(p.country)}`,
      },
    };
    const inst = await repo.save(repo.create(data));

    const projects = arr<Record<string, unknown>>(p.projects);
    if (projects.length) {
      await manager.getRepository(ResearchProject).save(projects.map((x) => manager.getRepository(ResearchProject).create({
        researchInstitutionId: inst.id, title: str(x.title), area: str(x.area), status: str(x.status, "Ongoing"),
        startYear: num(x.startYear, new Date().getFullYear()), partners: strArr(x.partners),
      })));
    }

    const publications = arr<Record<string, unknown>>(p.publications);
    if (publications.length) {
      await manager.getRepository(Publication).save(publications.map((x) => manager.getRepository(Publication).create({
        researchInstitutionId: inst.id, title: str(x.title), area: str(x.area), authors: str(x.authors), journal: str(x.journal), year: num(x.year, new Date().getFullYear()),
      })));
    }

    const technologies = arr<Record<string, unknown>>(p.technologies);
    if (technologies.length) {
      await manager.getRepository(ResearchTechnology).save(technologies.map((x) => manager.getRepository(ResearchTechnology).create({
        researchInstitutionId: inst.id, name: str(x.name), area: str(x.area), trl: num(x.trl, 1), status: str(x.status),
      })));
    }

    const researchers = arr<Record<string, unknown>>(p.researchers);
    if (researchers.length) {
      await manager.getRepository(Researcher).save(researchers.map((x) => manager.getRepository(Researcher).create({
        researchInstitutionId: inst.id, name: str(x.name), title: str(x.title), area: str(x.area),
      })));
    }

    const collaborations = arr<Record<string, unknown>>(p.collaborations);
    if (collaborations.length) {
      await manager.getRepository(Partnership).save(collaborations.map((x) => manager.getRepository(Partnership).create({
        entityType: EntityKind.RESEARCH, entityId: inst.id, type: str(x.type), partnerName: str(x.partner ?? x.partnerName), description: str(x.description ?? x.desc),
      })));
    }

    const sectorNames = strArr(p.healthcareFocus).length ? strArr(p.healthcareFocus) : strArr(p.coreResearchAreas);
    await linkSectors(manager, EntityKind.RESEARCH, inst.id, sectorNames);

    return inst.id;
  }
}
