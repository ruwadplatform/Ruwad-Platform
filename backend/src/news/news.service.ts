import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NewsArticle } from "./news-article.entity";
import { NewsRelatedEntity } from "./news-related-entity.entity";
import { CreateNewsDto } from "./dto/create-news.dto";
import { UpdateNewsDto } from "./dto/update-news.dto";
import { NewsQueryDto } from "./dto/news-query.dto";
import { paginate, PaginatedResult } from "../common/pagination.dto";
import { normalizeTitle, normalizeUrl } from "../content/content-utils";

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(NewsArticle) private readonly repo: Repository<NewsArticle>,
    @InjectRepository(NewsRelatedEntity) private readonly related: Repository<NewsRelatedEntity>,
  ) {}

  async create(dto: CreateNewsDto): Promise<NewsArticle> {
    const { relatedEntities, ...rest } = dto;
    // The same dedup keys the automatic collector uses, so a manually added
    // story and a collected one can't both exist.
    const urlKey = normalizeUrl(rest.sourceUrl);
    if (urlKey && (await this.repo.findOne({ where: { urlKey } }))) throw new ConflictException("An article with this source URL already exists");
    const saved = await this.repo.save(this.repo.create({ ...rest, urlKey, titleKey: normalizeTitle(rest.title), origin: "manual" }));
    if (relatedEntities?.length) await this.related.save(this.related.create(relatedEntities.map((r) => ({ newsId: saved.id, ...r }))));
    return saved;
  }

  async update(id: string, dto: UpdateNewsDto): Promise<NewsArticle> {
    const article = await this.findEntityOrThrow(id);
    const { relatedEntities, ...rest } = dto;
    Object.assign(article, rest);
    if (rest.sourceUrl) article.urlKey = normalizeUrl(rest.sourceUrl);
    if (rest.title) article.titleKey = normalizeTitle(rest.title);
    const saved = await this.repo.save(article);
    if (relatedEntities) {
      await this.related.delete({ newsId: id });
      if (relatedEntities.length) await this.related.save(this.related.create(relatedEntities.map((r) => ({ newsId: id, ...r }))));
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  /** Admin lookup — includes unpublished rows. */
  findEntityOrThrow(id: string): Promise<NewsArticle> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("News article not found");
    });
  }

  /** Public list: published articles only, newest first. */
  async findAll(query: NewsQueryDto): Promise<PaginatedResult<NewsArticle & { relatedEntities: NewsRelatedEntity[] }>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("n").where("n.isPublished = true");
    if (query.search) qb.andWhere("(n.title ILIKE :q OR n.summary ILIKE :q)", { q: `%${query.search}%` });
    if (query.category) qb.andWhere("n.category = :category", { category: query.category });
    if (query.country) qb.andWhere("n.geography = :country", { country: query.country });
    if (query.from) qb.andWhere("n.publishedDate >= :from", { from: query.from.slice(0, 10) });
    if (query.to) qb.andWhere("n.publishedDate <= :to", { to: query.to.slice(0, 10) });
    qb.orderBy("n.isFeatured", "DESC").addOrderBy("n.publishedDate", "DESC").addOrderBy("n.createdAt", "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map(async (n) => ({ ...n, relatedEntities: await this.related.find({ where: { newsId: n.id } }) })));
    return paginate(items, total, page, limit);
  }

  async findByIdOrThrow(id: string): Promise<NewsArticle & { relatedEntities: NewsRelatedEntity[] }> {
    const article = await this.findEntityOrThrow(id);
    if (!article.isPublished) throw new NotFoundException("News article not found");
    const relatedEntities = await this.related.find({ where: { newsId: id } });
    return { ...article, relatedEntities };
  }
}
