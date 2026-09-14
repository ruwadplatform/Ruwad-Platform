import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DataRoomAccess } from "./data-room-access.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { EntityKind, DataRoomAccessStatus } from "../common/enums";

@Injectable()
export class DataRoomService {
  constructor(
    @InjectRepository(DataRoomAccess) private readonly repo: Repository<DataRoomAccess>,
    @InjectRepository(DocumentRef) private readonly documents: Repository<DocumentRef>,
  ) {}

  findForUser(userId: string): Promise<DataRoomAccess[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: "DESC" } });
  }

  findAllPending(): Promise<DataRoomAccess[]> {
    return this.repo.find({ where: { status: DataRoomAccessStatus.REQUESTED }, order: { createdAt: "ASC" } });
  }

  async requestAccess(userId: string, kind: EntityKind, entityId: string): Promise<DataRoomAccess> {
    if (kind === EntityKind.RESEARCH) throw new BadRequestException("Research & Academia listings have no Data Room");
    const existing = await this.repo.findOne({ where: { userId, kind, entityId } });
    if (existing) return existing;
    return this.repo.save(this.repo.create({ userId, kind, entityId, status: DataRoomAccessStatus.REQUESTED }));
  }

  async status(userId: string, kind: EntityKind, entityId: string): Promise<{ status: DataRoomAccessStatus; documents: DocumentRef[] }> {
    const access = await this.repo.findOne({ where: { userId, kind, entityId } });
    const documents = await this.documents.find({ where: { entityType: kind, entityId } });
    return { status: access?.status ?? DataRoomAccessStatus.LOCKED, documents };
  }

  async review(id: string, status: DataRoomAccessStatus): Promise<DataRoomAccess> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Access request not found");
    item.status = status;
    if (status === DataRoomAccessStatus.APPROVED) item.ndaSignedAt = new Date();
    return this.repo.save(item);
  }
}
