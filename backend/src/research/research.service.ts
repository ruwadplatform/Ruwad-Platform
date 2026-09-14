import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResearchInstitution } from "./research-institution.entity";
import { ResearchProject, Publication, ResearchTechnology, Researcher } from "./research-child-entities.entity";
import { CreateResearchDto } from "./dto/create-research.dto";
import { UpdateResearchDto } from "./dto/update-research.dto";
import { QueryResearchDto } from "./dto/query-research.dto";
import { DirectorySharedService } from "../directory-shared/directory-shared.service";
import { EntityKind } from "../common/enums";
import { initials, slugify } from "../common/slug.util";
import { paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class ResearchService {
  constructor(
    @InjectRepository(ResearchInstitution) private readonly repo: Repository<ResearchInstitution>,
    @InjectRepository(ResearchProject) private readonly projects: Repository<ResearchProject>,
    @InjectRepository(Publication) private readonly publications: Repository<Publication>,
    @InjectRepository(ResearchTechnology) private readonly technologies: Repository<ResearchTechnology>,
    @InjectRepository(Researcher) private readonly researchers: Repository<Researcher>,
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

  async create(dto: CreateResearchDto): Promise<ResearchInstitution> {
    const slug = await this.uniqueSlug(dto.name);
    const saved = await this.repo.save(this.repo.create({
      slug, name: dto.name, type: dto.type, city: dto.city, country: dto.country, founded: dto.founded, website: dto.website,
      numResearchers: dto.numResearchers, numCenters: dto.numCenters, numLabs: dto.numLabs, about: dto.about,
      collaborationStatus: dto.collaborationStatus ?? "Selective", technologyReadinessLevel: dto.technologyReadinessLevel, patentsCount: dto.patentsCount,
      provenanceConfidence: "Medium", provenanceLastUpdated: new Date().toISOString().slice(0, 10), provenanceSources: ["Institution-published research office data"],
    }));
    await this.applyRelations(saved.id, dto);
    return saved;
  }

  async update(id: string, dto: UpdateResearchDto): Promise<ResearchInstitution> {
    const inst = await this.findEntityOrThrow(id);
    if (dto.name && dto.name !== inst.name) inst.slug = await this.uniqueSlug(dto.name, id);
    Object.assign(inst, dto);
    const saved = await this.repo.save(inst);
    await this.applyRelations(id, dto);
    return saved;
  }

  private async applyRelations(id: string, dto: Partial<CreateResearchDto>): Promise<void> {
    if (dto.sectors) await this.shared.setSectors(EntityKind.RESEARCH, id, dto.sectors);
    if (dto.projects) { await this.projects.delete({ researchInstitutionId: id }); if (dto.projects.length) await this.projects.save(this.projects.create(dto.projects.map((p) => ({ researchInstitutionId: id, ...p, partners: p.partners ?? [] })))); }
    if (dto.publications) { await this.publications.delete({ researchInstitutionId: id }); if (dto.publications.length) await this.publications.save(this.publications.create(dto.publications.map((p) => ({ researchInstitutionId: id, ...p })))); }
    if (dto.technologies) { await this.technologies.delete({ researchInstitutionId: id }); if (dto.technologies.length) await this.technologies.save(this.technologies.create(dto.technologies.map((t) => ({ researchInstitutionId: id, ...t })))); }
    if (dto.researchers) { await this.researchers.delete({ researchInstitutionId: id }); if (dto.researchers.length) await this.researchers.save(this.researchers.create(dto.researchers.map((r) => ({ researchInstitutionId: id, ...r })))); }
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<ResearchInstitution> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Research institution not found");
    });
  }

  async findAll(query: QueryResearchDto): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("r");
    if (query.search) qb.andWhere("r.name ILIKE :q", { q: `%${query.search}%` });
    if (query.type) qb.andWhere("r.type = :type", { type: query.type });
    if (query.country) qb.andWhere("r.country = :country", { country: query.country });
    if (query.city) qb.andWhere("r.city = :city", { city: query.city });
    if (query.collaborationStatus) qb.andWhere("r.collaborationStatus = :cs", { cs: query.collaborationStatus });
    qb.orderBy("r.name", (query.order ?? "asc").toUpperCase() as "ASC" | "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map(async (r) => {
      const [healthcareFocus, projectCount, publicationCount] = await Promise.all([
        this.shared.getSectorNames(EntityKind.RESEARCH, r.id),
        this.projects.count({ where: { researchInstitutionId: r.id } }),
        this.publications.count({ where: { researchInstitutionId: r.id } }),
      ]);
      return {
        id: r.id, slug: r.slug, name: r.name, logo: initials(r.name), logoImageId: r.logoImageId ?? null, type: r.type, city: r.city, country: r.country,
        founded: r.founded, about: r.about, numResearchers: r.numResearchers, collaborationStatus: r.collaborationStatus,
        coreResearchAreas: r.coreResearchAreas, healthcareFocus, projectCount, publicationCount,
      };
    }));
    return paginate(items, total, page, limit);
  }

  async findBySlugOrThrow(slug: string): Promise<Record<string, unknown>> {
    const inst = await this.repo.findOne({ where: { slug } });
    if (!inst) throw new NotFoundException("Research institution not found");
    const [sectors, projects, publications, technologies, researchers, partnerships, contact] = await Promise.all([
      this.shared.getSectorNames(EntityKind.RESEARCH, inst.id),
      this.projects.find({ where: { researchInstitutionId: inst.id } }),
      this.publications.find({ where: { researchInstitutionId: inst.id } }),
      this.technologies.find({ where: { researchInstitutionId: inst.id } }),
      this.researchers.find({ where: { researchInstitutionId: inst.id } }),
      this.shared.getPartnerships(EntityKind.RESEARCH, inst.id),
      this.shared.getContact(EntityKind.RESEARCH, inst.id),
    ]);
    // Deliberately no `documents`/DataRoom lookup here — Research &
    // Academia has no Data Room, by explicit product rule.
    return { ...inst, logo: initials(inst.name), sectors, projects, publications, technologies, researchers, partnerships, contact };
  }
}
