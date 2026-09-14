import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EntityMembership } from "./entity-membership.entity";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { UpdateMembershipDto } from "./dto/update-membership.dto";
import { EntityKind, MembershipRole } from "../common/enums";
import { Startup } from "../startups/startup.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { Multinational } from "../multinationals/multinational.entity";

export interface OwnedListing {
  membershipId: string;
  kind: EntityKind;
  entityId: string;
  name: string;
  slug: string;
  listingStatus: string;
  listingVisibility: string;
  views: number;
  lastUpdated: Date;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(EntityMembership) private readonly repo: Repository<EntityMembership>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(ResearchInstitution) private readonly research: Repository<ResearchInstitution>,
    @InjectRepository(Multinational) private readonly multinationals: Repository<Multinational>,
  ) {}

  private repoForKind(kind: EntityKind) {
    switch (kind) {
      case EntityKind.STARTUP: return this.startups;
      case EntityKind.INVESTOR: return this.investors;
      case EntityKind.HUB: return this.hubs;
      case EntityKind.RESEARCH: return this.research;
      case EntityKind.MULTINATIONAL: return this.multinationals;
    }
  }

  async findMyListings(userId: string): Promise<OwnedListing[]> {
    const memberships = await this.repo.find({ where: { userId }, order: { createdAt: "DESC" } });
    const listings: OwnedListing[] = [];
    for (const m of memberships) {
      const entity = await this.repoForKind(m.kind).findOne({ where: { id: m.entityId } as any });
      if (!entity) continue;
      listings.push({
        membershipId: m.id,
        kind: m.kind,
        entityId: m.entityId,
        name: (entity as any).name,
        slug: (entity as any).slug,
        listingStatus: m.listingStatus,
        listingVisibility: m.listingVisibility,
        views: m.views,
        lastUpdated: m.updatedAt,
      });
    }
    return listings;
  }

  async isOwner(userId: string, kind: EntityKind, entityId: string): Promise<boolean> {
    return this.repo.exists({ where: { userId, kind, entityId } });
  }

  create(dto: CreateMembershipDto): Promise<EntityMembership> {
    return this.repo.save(this.repo.create({ ...dto, role: dto.role ?? MembershipRole.OWNER }));
  }

  async update(userId: string, id: string, dto: UpdateMembershipDto): Promise<EntityMembership> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException("Membership not found");
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Membership not found");
    await this.repo.delete(item.id);
  }
}
