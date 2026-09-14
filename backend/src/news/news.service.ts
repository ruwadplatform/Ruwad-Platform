import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NewsArticle } from "./news-article.entity";
import { NewsRelatedEntity } from "./news-related-entity.entity";
import { CreateNewsDto } from "./dto/create-news.dto";
import { UpdateNewsDto } from "./dto/update-news.dto";
import { PaginationQueryDto, paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(NewsArticle) private readonly repo: Repository<NewsArticle>,
    @InjectRepository(NewsRelatedEntity) private readonly related: Repository<NewsRelatedEntity>,
  ) {}

  async create(dto: CreateNewsDto): Promise<NewsArticle> {
    const { relatedEntities, ...rest } = dto;
    const saved = await this.repo.save(this.repo.create(rest));
    if (relatedEntities?.length) await this.related.save(this.related.create(relatedEntities.map((r) => ({ newsId: saved.id, ...r }))));
    return saved;
  }

  async update(id: string, dto: UpdateNewsDto): Promise<NewsArticle> {
    const article = await this.findEntityOrThrow(id);
    const { relatedEntities, ...rest } = dto;
    Object.assign(article, rest);
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

  findEntityOrThrow(id: string): Promise<NewsArticle> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("News article not found");
    });
  }

  async findAll(query: PaginationQueryDto & { category?: string }): Promise<PaginatedResult<NewsArticle & { relatedEntities: NewsRelatedEntity[] }>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("n");
    if (query.search) qb.andWhere("n.title ILIKE :q", { q: `%${query.search}%` });
    if (query.category) qb.andWhere("n.category = :category", { category: query.category });
    qb.orderBy("n.publishedDate", "DESC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map(async (n) => ({ ...n, relatedEntities: await this.related.find({ where: { newsId: n.id } }) })));
    return paginate(items, total, page, limit);
  }

  async findByIdOrThrow(id: string): Promise<NewsArticle & { relatedEntities: NewsRelatedEntity[] }> {
    const article = await this.findEntityOrThrow(id);
    const relatedEntities = await this.related.find({ where: { newsId: id } });
    return { ...article, relatedEntities };
  }
}
