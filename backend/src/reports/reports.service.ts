import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Report } from "./report.entity";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { PaginationQueryDto, paginate, PaginatedResult } from "../common/pagination.dto";
import { slugify } from "../common/slug.util";
import { StartupsService } from "../startups/startups.service";
import { InvestorsService } from "../investors/investors.service";

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report) private readonly repo: Repository<Report>,
    private readonly startups: StartupsService,
    private readonly investors: InvestorsService,
  ) {}

  async uniqueSlug(title: string, excludeId?: string): Promise<string> {
    const base = slugify(title);
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.repo.findOne({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${n++}`;
    }
  }

  async create(dto: CreateReportDto): Promise<Report> {
    const slug = await this.uniqueSlug(dto.title);
    return this.repo.save(this.repo.create({
      slug, ...dto, authors: dto.authors ?? [], badges: dto.badges ?? [], keyFindings: dto.keyFindings ?? [],
      marketStats: dto.marketStats ?? [], sections: dto.sections ?? [], sources: dto.sources ?? [],
      relatedStartupIds: dto.relatedStartupIds ?? [], relatedInvestorIds: dto.relatedInvestorIds ?? [], relatedReportIds: dto.relatedReportIds ?? [],
      publishedAt: new Date(),
    }));
  }

  async update(id: string, dto: UpdateReportDto): Promise<Report> {
    const report = await this.findEntityOrThrow(id);
    if (dto.title && dto.title !== report.title) report.slug = await this.uniqueSlug(dto.title, id);
    Object.assign(report, dto);
    return this.repo.save(report);
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<Report> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Report not found");
    });
  }

  async findAll(query: PaginationQueryDto & { category?: string }): Promise<PaginatedResult<Report>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("r").where("r.isPublished = true");
    if (query.search) qb.andWhere("r.title ILIKE :q", { q: `%${query.search}%` });
    if (query.category) qb.andWhere("r.category = :category", { category: query.category });
    qb.orderBy("r.publicationDate", "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows.map((r) => this.slim(r)), total, page, limit);
  }

  /** Lists don't need the heavy generated payload (statistics, saved sources). */
  private slim(r: Report): Report {
    return { ...r, internalStats: undefined, externalSources: [], researchQueries: [], generated: undefined, aiOverview: undefined, libraryContent: undefined } as Report;
  }

  /** Admin view: drafts and published reports alike. */
  async findAllAdmin(): Promise<Report[]> {
    const rows = await this.repo.find({ order: { updatedAt: "DESC" } });
    return rows.map((r) => this.slim(r));
  }

  async findBySlugAdmin(slug: string): Promise<Report> {
    const report = await this.repo.findOne({ where: { slug } });
    if (!report) throw new NotFoundException("Report not found");
    return report;
  }

  async setPublished(id: string, published: boolean): Promise<Report> {
    const report = await this.findEntityOrThrow(id);
    report.isPublished = published;
    if (published) report.publishedAt = new Date();
    return this.repo.save(report);
  }

  async findBySlugOrThrow(slug: string): Promise<Record<string, unknown>> {
    const report = await this.repo.findOne({ where: { slug, isPublished: true } }); // drafts and unpublished reports are not public
    if (!report) throw new NotFoundException("Report not found");

    const [relatedCompanies, relatedInvestors, relatedReports] = await Promise.all([
      Promise.all(report.relatedStartupIds.map((id) => this.startups.findEntityOrThrow(id).then((s) => this.startups.toSummary(s)).catch(() => null))),
      Promise.all(report.relatedInvestorIds.map((id) => this.investors.findEntityOrThrow(id).then((v) => this.investors.toSummary(v)).catch(() => null))),
      Promise.all(report.relatedReportIds.map((id) => this.repo.findOne({ where: { id } }).catch(() => null))),
    ]);

    return {
      ...report,
      relatedCompanies: relatedCompanies.filter(Boolean),
      relatedInvestors: relatedInvestors.filter(Boolean),
      relatedReports: relatedReports.filter(Boolean),
    };
  }
}
