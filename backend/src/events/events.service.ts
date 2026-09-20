import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Event } from "./event.entity";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventsQueryDto } from "./dto/events-query.dto";
import { paginate, PaginatedResult } from "../common/pagination.dto";
import { eventStatus, normalizeEventName, normalizeUrl, todayIso, type EventStatus } from "../content/content-utils";

export type EventView = Event & { status: EventStatus };

/** Status is derived from the dates on every read, so it can never go stale
 * (an event that started or ended since the last collection run is already
 * ONGOING / PAST here). */
export function withStatus(e: Event, now = new Date()): EventView {
  const start = e.startDate ?? e.date;
  return { ...e, startDate: start, endDate: e.endDate ?? e.date, status: eventStatus(start, e.endDate ?? e.date, now) };
}

@Injectable()
export class EventsService {
  constructor(@InjectRepository(Event) private readonly repo: Repository<Event>) {}

  create(dto: CreateEventDto): Promise<Event> {
    const start = dto.startDate ?? dto.date;
    return this.repo.save(this.repo.create({
      ...dto, date: start, startDate: start, endDate: dto.endDate ?? start,
      registrationStatus: dto.registrationStatus ?? "Open", urlKey: normalizeUrl(dto.url), nameKey: normalizeEventName(dto.name), origin: "manual", dateSource: "manual",
    }));
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findEntityOrThrow(id);
    Object.assign(event, dto);
    if (dto.startDate || dto.date) { event.startDate = dto.startDate ?? dto.date ?? event.startDate; event.date = event.startDate ?? event.date; }
    if (dto.url) event.urlKey = normalizeUrl(dto.url);
    if (dto.name) event.nameKey = normalizeEventName(dto.name);
    return this.repo.save(event);
  }

  async remove(id: string): Promise<void> {
    await this.findEntityOrThrow(id);
    await this.repo.delete(id);
  }

  /** Admin lookup — includes unpublished rows. */
  findEntityOrThrow(id: string): Promise<Event> {
    return this.repo.findOneOrFail({ where: { id } }).catch(() => {
      throw new NotFoundException("Event not found");
    });
  }

  async findPublishedOrThrow(id: string): Promise<EventView> {
    const e = await this.findEntityOrThrow(id);
    if (!e.isPublished) throw new NotFoundException("Event not found");
    return withStatus(e);
  }

  /** Public list: published events; default = ONGOING + UPCOMING (soonest first). */
  async findAll(query: EventsQueryDto, now = new Date()): Promise<PaginatedResult<EventView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const today = todayIso(now);
    const start = "COALESCE(e.startDate, e.date)";
    const end = "COALESCE(e.endDate, e.date)";
    const qb = this.repo.createQueryBuilder("e").where("e.isPublished = true");
    const status = query.status ?? "ALL_CURRENT";
    if (status === "UPCOMING") qb.andWhere(`${start} > :today`, { today });
    else if (status === "ONGOING") qb.andWhere(`${start} <= :today AND ${end} >= :today`, { today });
    else if (status === "PAST") qb.andWhere(`${end} < :today`, { today });
    else if (status === "ALL_CURRENT") qb.andWhere(`${end} >= :today`, { today });
    if (query.search) qb.andWhere("(e.name ILIKE :q OR e.description ILIKE :q)", { q: `%${query.search}%` });
    if (query.country) qb.andWhere("e.country = :country", { country: query.country });
    if (query.type) qb.andWhere("e.type = :type", { type: query.type });
    if (query.category) qb.andWhere("e.sector = :category", { category: query.category });
    if (query.from) qb.andWhere(`${end} >= :from`, { from: query.from.slice(0, 10) });
    if (query.to) qb.andWhere(`${start} <= :to`, { to: query.to.slice(0, 10) });
    qb.orderBy("e.isFeatured", "DESC").addOrderBy(start, status === "PAST" ? "DESC" : "ASC");
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows.map((r) => withStatus(r, now)), total, page, limit);
  }
}
