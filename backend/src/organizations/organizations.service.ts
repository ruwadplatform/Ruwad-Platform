import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EntityMembership } from "./entity-membership.entity";
import { ListingClaim } from "./listing-claim.entity";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { UpdateMembershipDto } from "./dto/update-membership.dto";
import { CreateListingClaimDto } from "./dto/create-listing-claim.dto";
import { EntityKind, MembershipRole } from "../common/enums";
import { Startup } from "../startups/startup.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { Multinational } from "../multinationals/multinational.entity";
import { UsersService } from "../users/users.service";

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
    @InjectRepository(ListingClaim) private readonly claims: Repository<ListingClaim>,
    @InjectRepository(Startup) private readonly startups: Repository<Startup>,
    @InjectRepository(Investor) private readonly investors: Repository<Investor>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(ResearchInstitution) private readonly research: Repository<ResearchInstitution>,
    @InjectRepository(Multinational) private readonly multinationals: Repository<Multinational>,
    private readonly users: UsersService,
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

  /** Strict variant of isOwner(): requires role = OWNER, not just any
   * membership row (an ADMIN/EDITOR/VIEWER member of an entity must not be
   * able to act as its owner for Data Room review). */
  async isEntityOwner(userId: string, kind: EntityKind, entityId: string): Promise<boolean> {
    return this.repo.exists({ where: { userId, kind, entityId, role: MembershipRole.OWNER } });
  }

  /** Every entity this user is the OWNER of, with its display name. */
  async findOwnedEntityRefs(userId: string): Promise<{ kind: EntityKind; entityId: string; name: string; slug: string }[]> {
    const memberships = await this.repo.find({ where: { userId, role: MembershipRole.OWNER } });
    const refs: { kind: EntityKind; entityId: string; name: string; slug: string }[] = [];
    for (const m of memberships) {
      const entity = await this.repoForKind(m.kind).findOne({ where: { id: m.entityId } as any });
      if (entity) refs.push({ kind: m.kind, entityId: m.entityId, name: (entity as any).name, slug: (entity as any).slug });
    }
    return refs;
  }

  /** Resolves who owns a given directory entity and its display name — the
   * single authoritative lookup for both, used by email notifications so
   * they never need to duplicate this join or guess an owner column that
   * doesn't exist on the entity itself (ownership only lives in
   * EntityMembership, see the class comment above). Either field is null
   * if no OWNER membership row or no matching entity exists. */
  async findOwnerAndEntity(kind: EntityKind, entityId: string): Promise<{ ownerUserId: string | null; name: string | null }> {
    const [membership, entity] = await Promise.all([
      this.repo.findOne({ where: { kind, entityId, role: MembershipRole.OWNER } }),
      this.repoForKind(kind).findOne({ where: { id: entityId } as any }),
    ]);
    return { ownerUserId: membership?.userId ?? null, name: (entity as any)?.name ?? null };
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

  // ------------------------------------------------------------------ listing claims

  /** Whether ANY owner membership already exists for this entity — a listing that is already owned can't be claimed again. */
  private isAlreadyOwned(kind: EntityKind, entityId: string): Promise<boolean> {
    return this.repo.exists({ where: { kind, entityId, role: MembershipRole.OWNER } });
  }

  /** A pending claim on this specific listing, if any — surfaced on the public profile so the "Claim" button can show
   * "Claim Pending Review" without revealing who filed it. */
  async pendingClaimForEntity(kind: EntityKind, entityId: string): Promise<boolean> {
    return this.claims.exists({ where: { kind, entityId, status: "PENDING" } });
  }

  async myClaim(userId: string): Promise<ListingClaim | null> {
    return this.claims.findOne({ where: { userId, status: "PENDING" }, order: { createdAt: "DESC" } });
  }

  async submitClaim(userId: string, dto: CreateListingClaimDto): Promise<ListingClaim> {
    const entity = await this.repoForKind(dto.kind).findOne({ where: { id: dto.entityId } as any });
    if (!entity) throw new NotFoundException("Listing not found");
    if (await this.isAlreadyOwned(dto.kind, dto.entityId)) throw new ConflictException("This listing has already been claimed");
    if (await this.pendingClaimForEntity(dto.kind, dto.entityId)) throw new ConflictException("This listing already has a claim under review");
    if (await this.myClaim(userId)) throw new ConflictException("You already have a claim under review — one company claim per account");
    return this.claims.save(this.claims.create({ userId, kind: dto.kind, entityId: dto.entityId, role: dto.role, note: dto.note ?? "", status: "PENDING" }));
  }

  /** Admin view: every claim, most recent first — the reviewer decides case by case, so nothing is filtered out here. */
  async findAllClaimsAdmin(): Promise<(ListingClaim & { entityName: string | null; claimantEmail: string | null })[]> {
    const rows = await this.claims.find({ order: { createdAt: "DESC" } });
    const out: (ListingClaim & { entityName: string | null; claimantEmail: string | null })[] = [];
    for (const c of rows) {
      const [entity, user] = await Promise.all([
        this.repoForKind(c.kind).findOne({ where: { id: c.entityId } as any }),
        this.users.findByIdOrThrow(c.userId).catch(() => null),
      ]);
      out.push({ ...c, entityName: (entity as any)?.name ?? null, claimantEmail: user?.email ?? null });
    }
    return out;
  }

  private async findClaimOrThrow(id: string): Promise<ListingClaim> {
    const claim = await this.claims.findOne({ where: { id } });
    if (!claim) throw new NotFoundException("Claim not found");
    return claim;
  }

  /** Approving a claim is the ONLY way an EntityMembership gets created from a claim — it grants OWNER access and,
   * for a startup or an investor, moves the profile from "unclaimed" to "self-reported" (claimed, not yet independently reviewed). */
  async approveClaim(id: string, adminUserId: string): Promise<ListingClaim> {
    const claim = await this.findClaimOrThrow(id);
    if (claim.status !== "PENDING") throw new BadRequestException("This claim has already been reviewed");
    if (await this.isAlreadyOwned(claim.kind, claim.entityId)) throw new ConflictException("This listing has already been claimed by another approved request");
    await this.repo.save(this.repo.create({ userId: claim.userId, kind: claim.kind, entityId: claim.entityId, role: MembershipRole.OWNER }));
    if (claim.kind === EntityKind.STARTUP) await this.startups.update(claim.entityId, { verified: "self-reported" });
    if (claim.kind === EntityKind.INVESTOR) await this.investors.update(claim.entityId, { verified: "self-reported" });
    claim.status = "APPROVED";
    claim.reviewedAt = new Date();
    claim.reviewedByUserId = adminUserId;
    return this.claims.save(claim);
  }

  async rejectClaim(id: string, adminUserId: string, reason?: string): Promise<ListingClaim> {
    const claim = await this.findClaimOrThrow(id);
    if (claim.status !== "PENDING") throw new BadRequestException("This claim has already been reviewed");
    claim.status = "REJECTED";
    claim.reviewedAt = new Date();
    claim.reviewedByUserId = adminUserId;
    claim.rejectionReason = reason ?? null;
    return this.claims.save(claim);
  }
}
