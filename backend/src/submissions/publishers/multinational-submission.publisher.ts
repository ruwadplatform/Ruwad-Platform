import { Injectable } from "@nestjs/common";
import { DeepPartial, EntityManager } from "typeorm";
import { Multinational } from "../../multinationals/multinational.entity";
import { ProductRef } from "../../directory-shared/product.entity";
import { Partnership } from "../../directory-shared/partnership.entity";
import { DocumentRef } from "../../directory-shared/document-ref.entity";
import { Contact } from "../../directory-shared/contact.entity";
import { EntityKind } from "../../common/enums";
import { uniqueSlugFor } from "../../common/slug.util";
import { SubmissionPublisher, arr, bool, num, str, strArr } from "./publisher.types";
import { linkSectors } from "./startup-submission.publisher";

@Injectable()
export class MultinationalSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.MULTINATIONAL;

  async publish(manager: EntityManager, p: Record<string, unknown>): Promise<string> {
    const repo = manager.getRepository(Multinational);
    const slug = await uniqueSlugFor((s) => repo.findOne({ where: { slug: s } }), str(p.name, "untitled-company"));

    const data: DeepPartial<Multinational> = {
      slug,
      name: str(p.name), logoImageId: str(p.logoImageId) || undefined,
      category: str(p.category), subsector: str(p.subsector), tagline: str(p.tagline),
      country: str(p.country), city: str(p.city), hq: str(p.hq),
      founded: Number(p.founded) || new Date().getFullYear(), status: "Active", businessModel: str(p.businessModel, "Enterprise"),
      employees: num(p.employees), companySize: str(p.companySize, "Enterprise (1,000-9,999)") as Multinational["companySize"],
      desc: str(p.desc), problem: str(p.problem, "—"), solution: str(p.solution, "—"), advantage: str(p.advantage, "—"),
      sfda: str(p.sfda, "Not Submitted"), fda: str(p.fda, "N/A"), ce: str(p.ce, "N/A"),
      clinicalStatus: str(p.clinicalStatus, "Not disclosed"), patentStatus: str(p.patentStatus, "Not disclosed"),
      marketTam: str(p.marketTam, "—"), marketSam: str(p.marketSam, "—"), marketSom: str(p.marketSom, "—"), marketCompetitors: strArr(p.marketCompetitors),
      saudiOffice: bool(p.saudiPresence), regionalHeadquarters: bool(p.regionalHeadquarters), manufacturing: bool(p.manufacturing),
      distribution: bool(p.distribution), clinicalOperations: bool(p.clinicalOperations), trainingCenters: bool(p.trainingCenters),
      researchOperations: bool(p.researchOperations), countriesActiveIn: strArr(p.countriesActiveIn), regionalEmployees: str(p.regionalEmployees, "Undisclosed"),
      rdFocus: str(p.rdFocus, "—"), rdCenters: num(p.rdCenters), openInnovation: bool(p.openInnovation), startupCollaboration: bool(p.startupCollaboration),
      partnershipInterest: bool(p.partnershipInterest), techScouting: bool(p.techScouting),
      legalName: str(p.legalName, str(p.name)), website: str(p.website), email: str(p.email), phone: str(p.phone), linkedin: str(p.linkedin),
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      startupProgramsList: arr(p.startupProgramsList), investmentsList: arr(p.investmentsList), newsItems: [],
    };
    const mnc = await repo.save(repo.create(data));

    const products = arr<Record<string, unknown>>(p.products);
    if (products.length) {
      await manager.getRepository(ProductRef).save(products.map((x) => manager.getRepository(ProductRef).create({
        entityType: EntityKind.MULTINATIONAL, entityId: mnc.id, name: str(x.name), category: str(x.category), description: str(x.description),
      })));
    }

    const partnerships = arr<Record<string, unknown>>(p.partnerships);
    if (partnerships.length) {
      await manager.getRepository(Partnership).save(partnerships.map((x) => manager.getRepository(Partnership).create({
        entityType: EntityKind.MULTINATIONAL, entityId: mnc.id, type: str(x.type), partnerName: str(x.partner ?? x.partnerName, "—"), description: str(x.description ?? x.desc),
      })));
    }

    const docNames = strArr(p.documentChecklist);
    if (docNames.length) {
      await manager.getRepository(DocumentRef).save(docNames.map((n) => manager.getRepository(DocumentRef).create({
        entityType: EntityKind.MULTINATIONAL, entityId: mnc.id, name: n, onFile: false,
      })));
    }

    await manager.getRepository(Contact).save(manager.getRepository(Contact).create({
      entityType: EntityKind.MULTINATIONAL, entityId: mnc.id,
      mainContact: str(p.contactName), email: str(p.contactEmail, str(p.email)), phone: str(p.contactPhone, str(p.phone)), website: str(p.website), linkedin: str(p.contactLinkedin),
    }));

    await linkSectors(manager, EntityKind.MULTINATIONAL, mnc.id, [str(p.category)].concat(strArr(p.healthcareAreas)).filter(Boolean));

    return mnc.id;
  }
}
