import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Event } from "./event.entity";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { PaginationQueryDto, paginate, PaginatedResult } from "../common/pagination.dto";

@Injectable()
export class EventsService {
  constructor(@InjectRepository(Event) private readonly repo: Repository<Event>) {}

  create(dto: CreateEventDto): Promise<Event> {
    return this.repo.save(this.repo.create({ ...dto, registrationStatus: dto.registrationStatus ?? "Open" }));
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findEntityOrThrow(id);
    Object.assign(event, dto);
    return this.repo.save(event);
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  findEntityOrThrow(id: string): Promise<Event> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Event not found");
    });
  }

  async findAll(query: PaginationQueryDto & { country?: string; type?: string }): Promise<PaginatedResult<Event>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder("e");
    if (query.search) qb.andWhere("e.name ILIKE :q", { q: `%${query.search}%` });
    if (query.country) qb.andWhere("e.country = :country", { country: query.country });
    if (query.type) qb.andWhere("e.type = :type", { type: query.type });
    qb.orderBy("e.date", "ASC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows, total, page, limit);
  }
}
