import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { Investor } from "../../investors/investor.entity";
import { TeamMember } from "../../directory-shared/team-member.entity";
import { Contact } from "../../directory-shared/contact.entity";
import { EntityKind } from "../../common/enums";
import { uniqueSlugFor } from "../../common/slug.util";
import { SubmissionPublisher, arr, str, strArr } from "./publisher.types";
import { linkSectors } from "./startup-submission.publisher";

@Injectable()
export class InvestorSubmissionPublisher implements SubmissionPublisher {
  readonly kind = EntityKind.INVESTOR;

  async publish(manager: EntityManager, p: Record<string, unknown>): Promise<string> {
    const investors = manager.getRepository(Investor);
    const slug = await uniqueSlugFor((s) => investors.findOne({ where: { slug: s } }), str(p.name, "untitled-investor"));

    const investor = await investors.save(investors.create({
      slug,
      name: str(p.name), logoImageId: str(p.logoImageId) || undefined,
      short: str(p.short, str(p.name).slice(0, 40)), type: str(p.type), city: str(p.city),
      founded: Number(p.founded) || new Date().getFullYear(), desc: str(p.desc), thesis: str(p.thesis),
      stageFocus: strArr(p.preferredStages), ticket: str(p.ticket, formatTicket(p.minTicket, p.maxTicket)),
      aum: str(p.aum, "Undisclosed"), available: str(p.available, "Undisclosed"),
      investments: 0, exits: 0, hcDeals: 0,
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Self-reported via RUWĀD submission"],
      openOpps: strArr(p.openOpportunities), recentDeals: [], news: [],
    }));

    const team = arr<Record<string, unknown>>(p.team);
    if (team.length) {
      await manager.getRepository(TeamMember).save(team.map((t) => manager.getRepository(TeamMember).create({
        entityType: EntityKind.INVESTOR, entityId: investor.id, name: str(t.name), title: str(t.title), isFounder: false,
      })));
    }

    await manager.getRepository(Contact).save(manager.getRepository(Contact).create({
      entityType: EntityKind.INVESTOR, entityId: investor.id,
      mainContact: str(p.contactName), email: str(p.contactEmail), phone: str(p.contactPhone), linkedin: str(p.contactLinkedin), website: str(p.website),
    }));

    const sectorNames = strArr(p.healthcareSectors).length ? strArr(p.healthcareSectors) : strArr(p.healthcareFocus);
    await linkSectors(manager, EntityKind.INVESTOR, investor.id, sectorNames);

    return investor.id;
  }
}

function formatTicket(min: unknown, max: unknown): string {
  if (!min && !max) return "Undisclosed";
  return `SAR ${str(min, "?")}–${str(max, "?")}m`;
}
