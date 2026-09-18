import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Sector } from "./sector.entity";
import { EntitySector } from "./entity-sector.entity";
import { TeamMember } from "./team-member.entity";
import { DocumentRef } from "./document-ref.entity";
import { Contact } from "./contact.entity";
import { Partnership } from "./partnership.entity";
import { ProductRef } from "./product.entity";
import { EntityKind } from "../common/enums";

/** Shared read/write helpers for the polymorphic tables every directory
 * entity (startup/investor/hub/research/multinational) attaches to —
 * written once here instead of five times, one per directory module. */
@Injectable()
export class DirectorySharedService {
  constructor(
    @InjectRepository(Sector) private readonly sectors: Repository<Sector>,
    @InjectRepository(EntitySector) private readonly entitySectors: Repository<EntitySector>,
    @InjectRepository(TeamMember) private readonly teamMembers: Repository<TeamMember>,
    @InjectRepository(DocumentRef) private readonly documents: Repository<DocumentRef>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(Partnership) private readonly partnerships: Repository<Partnership>,
    @InjectRepository(ProductRef) private readonly products: Repository<ProductRef>,
  ) {}

  async getOrCreateSector(name: string): Promise<Sector> {
    let sector = await this.sectors.findOne({ where: { name } });
    if (!sector) sector = await this.sectors.save(this.sectors.create({ name }));
    return sector;
  }

  async setSectors(entityType: EntityKind, entityId: string, names: string[]): Promise<void> {
    await this.entitySectors.delete({ entityType, entityId });
    for (const name of names) {
      const sector = await this.getOrCreateSector(name);
      await this.entitySectors.save(this.entitySectors.create({ entityType, entityId, sectorId: sector.id }));
    }
  }

  async getSectorNames(entityType: EntityKind, entityId: string): Promise<string[]> {
    const links = await this.entitySectors.find({ where: { entityType, entityId } });
    if (!links.length) return [];
    const sectors = await this.sectors.find({ where: { id: In(links.map((l) => l.sectorId)) } });
    return sectors.map((s) => s.name);
  }

  /** Sector Distribution analytics: counts of entities per sector, scoped
   * to one or more entity types. Real GROUP BY, not client-side parsing. */
  async countByEntityType(entityTypes: EntityKind[]): Promise<{ sector: string; count: number }[]> {
    const rows = await this.entitySectors
      .createQueryBuilder("es")
      .innerJoin(Sector, "s", "s.id = es.sectorId")
      .select("s.name", "sector")
      .addSelect("COUNT(DISTINCT es.entityId)", "count")
      .where("es.entityType IN (:...types)", { types: entityTypes })
      .groupBy("s.name")
      .orderBy("count", "DESC")
      .getRawMany();
    return rows.map((r) => ({ sector: r.sector, count: Number(r.count) }));
  }

  setTeamMembers(entityType: EntityKind, entityId: string, members: { name: string; title: string; isFounder?: boolean }[]) {
    return this.replace(this.teamMembers, entityType, entityId, members.map((m) => ({ entityType, entityId, name: m.name, title: m.title, isFounder: !!m.isFounder })));
  }
  getTeamMembers(entityType: EntityKind, entityId: string) {
    return this.teamMembers.find({ where: { entityType, entityId } });
  }

  setDocuments(entityType: EntityKind, entityId: string, docs: { name: string; onFile: boolean }[]) {
    return this.replace(this.documents, entityType, entityId, docs.map((d) => ({ entityType, entityId, ...d })));
  }
  // No public getter on purpose: reading document rows goes through
  // DataRoomService.status(), the single owner/admin/APPROVED-gated path.

  async setContact(entityType: EntityKind, entityId: string, data: Partial<Contact>): Promise<Contact> {
    let contact = await this.contacts.findOne({ where: { entityType, entityId } });
    if (!contact) contact = this.contacts.create({ entityType, entityId });
    Object.assign(contact, data);
    return this.contacts.save(contact);
  }
  getContact(entityType: EntityKind, entityId: string) {
    return this.contacts.findOne({ where: { entityType, entityId } });
  }

  setPartnerships(entityType: EntityKind, entityId: string, items: { type: string; partnerName: string; description: string }[]) {
    return this.replace(this.partnerships, entityType, entityId, items.map((p) => ({ entityType, entityId, ...p })));
  }
  getPartnerships(entityType: EntityKind, entityId: string) {
    return this.partnerships.find({ where: { entityType, entityId } });
  }

  setProducts(entityType: EntityKind, entityId: string, items: { name: string; category: string; description: string }[]) {
    return this.replace(this.products, entityType, entityId, items.map((p) => ({ entityType, entityId, ...p })));
  }
  getProducts(entityType: EntityKind, entityId: string) {
    return this.products.find({ where: { entityType, entityId } });
  }

  /** delete-then-insert — these polymorphic child collections are always
   * replaced wholesale on write (matches how the frontend forms would
   * submit them: a full list, not incremental diffs). */
  private async replace<T extends { id: string }>(repo: Repository<T>, entityType: EntityKind, entityId: string, rows: Partial<T>[]): Promise<T[]> {
    await repo.delete({ entityType, entityId } as never);
    if (!rows.length) return [];
    return repo.save(repo.create(rows as T[]));
  }
}
