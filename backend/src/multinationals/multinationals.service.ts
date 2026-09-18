import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Multinational } from "./multinational.entity";
import { CreateMultinationalDto } from "./dto/create-multinational.dto";
import { UpdateMultinationalDto } from "./dto/update-multinational.dto";
import { QueryMultinationalsDto } from "./dto/query-multinationals.dto";
import { DirectorySharedService } from "../directory-shared/directory-shared.service";
import { EntityKind } from "../common/enums";
import { initials, slugify } from "../common/slug.util";
import { paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class MultinationalsService {
  constructor(
    @InjectRepository(Multinational) private readonly repo: Repository<Multinational>,
    private readonly shared: DirectorySharedService,
  ) {}

  private async uniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.repo.findOne({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${n++}`;
    }
  }

  async create(dto: CreateMultinationalDto): Promise<Multinational> {
    const slug = await this.uniqueSlug(dto.name);
    const saved = await this.repo.save(this.repo.create({
      slug, ...dto,
      marketCompetitors: dto.marketCompetitors ?? [], countriesActiveIn: dto.countriesActiveIn ?? ["Saudi Arabia"],
      saudiOffice: dto.saudiOffice ?? true, distribution: dto.distribution ?? true,
      openInnovation: dto.openInnovation ?? true, startupCollaboration: dto.startupCollaboration ?? true,
      partnershipInterest: dto.partnershipInterest ?? true, techScouting: dto.techScouting ?? true,
      provenanceConfidence: "High", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Public company disclosures"],
    }));
    await this.applyRelations(saved.id, dto);
    return saved;
  }

  async update(id: string, dto: UpdateMultinationalDto): Promise<Multinational> {
    const m = await this.findEntityOrThrow(id);
    if (dto.name && dto.name !== m.name) m.slug = await this.uniqueSlug(dto.name, id);
    Object.assign(m, dto);
    const saved = await this.repo.save(m);
    await this.applyRelations(id, dto);
    return saved;
  }

  private async applyRelations(id: string, dto: Partial<CreateMultinationalDto>): Promise<void> {
    if (dto.products) await this.shared.setProducts(EntityKind.MULTINATIONAL, id, dto.products);
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<Multinational> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Multinational not found");
    });
  }

  async findAll(query: QueryMultinationalsDto): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("m");
    if (query.search) qb.andWhere("m.name ILIKE :q", { q: `%${query.search}%` });
    if (query.category) qb.andWhere("m.category = :category", { category: query.category });
    if (query.country) qb.andWhere("m.country = :country", { country: query.country });
    qb.orderBy("m.name", (query.order ?? "asc").toUpperCase() as "ASC" | "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map(async (m) => {
      const products = await this.shared.getProducts(EntityKind.MULTINATIONAL, m.id);
      return {
        id: m.id, slug: m.slug, name: m.name, logo: initials(m.name), logoImageId: m.logoImageId ?? null, category: m.category, country: m.country,
        hq: m.hq, tagline: m.tagline, website: m.website, employees: m.employees, companySize: m.companySize,
        rdCenters: m.rdCenters, partnershipInterest: m.partnershipInterest, saudiOffice: m.saudiOffice,
        countriesActiveIn: m.countriesActiveIn, productCount: products.length,
      };
    }));
    return paginate(items, total, page, limit);
  }

  async findBySlugOrThrow(slug: string): Promise<Record<string, unknown>> {
    const m = await this.repo.findOne({ where: { slug } });
    if (!m) throw new NotFoundException("Multinational not found");
    // No `documents` in the public payload — see DataRoomService.status().
    const [products, partnerships, contact] = await Promise.all([
      this.shared.getProducts(EntityKind.MULTINATIONAL, m.id),
      this.shared.getPartnerships(EntityKind.MULTINATIONAL, m.id),
      this.shared.getContact(EntityKind.MULTINATIONAL, m.id),
    ]);
    return { ...m, logo: initials(m.name), products, partnerships, contact };
  }
}
