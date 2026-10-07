import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as path from "path";
import { DataRoomFile } from "./data-room-file.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { EntityKind } from "../common/enums";

/** Where a document belongs. The first five are the standard checklist every profile shows ("On file" / "Not provided"). */
export const CHECKLIST_CATEGORIES = ["Pitch Deck", "Cap Table", "Financial Statements", "Certifications", "Regulatory Approvals"] as const;
export const DATA_ROOM_CATEGORIES = [...CHECKLIST_CATEGORIES, "Legal", "Other"] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // per document
export const MAX_FILES = 50; // per Data Room
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // per Data Room, kept modest because files live in the database

type Kind = "pdf" | "zip" | "ole" | "png" | "jpg" | "text";
const TYPES: Record<string, { mime: string; kind: Kind }> = {
  ".pdf": { mime: "application/pdf", kind: "pdf" },
  ".docx": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "zip" },
  ".xlsx": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "zip" },
  ".pptx": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "zip" },
  ".doc": { mime: "application/msword", kind: "ole" },
  ".xls": { mime: "application/vnd.ms-excel", kind: "ole" },
  ".ppt": { mime: "application/vnd.ms-powerpoint", kind: "ole" },
  ".csv": { mime: "text/csv", kind: "text" },
  ".txt": { mime: "text/plain", kind: "text" },
  ".png": { mime: "image/png", kind: "png" },
  ".jpg": { mime: "image/jpeg", kind: "jpg" },
  ".jpeg": { mime: "image/jpeg", kind: "jpg" },
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
const MSG_TYPE = `Upload a PDF, Word, Excel, PowerPoint, CSV, text, PNG or JPG file (${ALLOWED_EXTENSIONS.join(", ")}).`;

/** The file's own leading bytes must match the type its extension claims, so a renamed file can never be stored as something it is not. */
function signatureMatches(kind: Kind, b: Buffer): boolean {
  switch (kind) {
    case "pdf": return b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
    case "zip": return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06);
    case "ole": return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case "png": return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "jpg": return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "text": return !b.subarray(0, 4096).includes(0); // plain text never contains NUL bytes
  }
}

/** Strips anything that could act as a path or break a header; the result is only ever used as a download name. */
export function safeFileName(original: string): string {
  const base = path.basename(original.replace(/\\/g, "/")).replace(/[\u0000-\u001f"<>|:*?]/g, "").trim();
  return base.slice(0, 150) || "document";
}

export interface DataRoomFileView {
  id: string;
  name: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

const view = (f: DataRoomFile): DataRoomFileView => ({ id: f.id, name: f.name, category: f.category, fileName: f.fileName, mimeType: f.mimeType, size: f.size, uploadedAt: f.createdAt });

/** The owner's side of a Data Room: add, list, download, retitle/recategorise and remove documents. Callers (the controller) have already proven the
 * user owns the entity; every query here is additionally scoped by entityId, so a file id from another Data Room can never be reached. */
@Injectable()
export class DataRoomFilesService {
  constructor(
    @InjectRepository(DataRoomFile) private readonly files: Repository<DataRoomFile>,
    @InjectRepository(DocumentRef) private readonly documents: Repository<DocumentRef>,
  ) {}

  async list(kind: EntityKind, entityId: string): Promise<{ files: DataRoomFileView[]; usage: { count: number; bytes: number; maxFiles: number; maxBytes: number; maxFileBytes: number } }> {
    const rows = await this.files.find({ where: { entityType: kind, entityId }, order: { createdAt: "DESC" } });
    return {
      files: rows.map(view),
      usage: { count: rows.length, bytes: rows.reduce((a, r) => a + r.size, 0), maxFiles: MAX_FILES, maxBytes: MAX_TOTAL_BYTES, maxFileBytes: MAX_FILE_BYTES },
    };
  }

  async upload(kind: EntityKind, entityId: string, userId: string, file: Express.Multer.File | undefined, dto: { category: string; name?: string }): Promise<DataRoomFileView> {
    if (!file) throw new BadRequestException("Choose a file to upload.");
    const ext = path.extname(file.originalname ?? "").toLowerCase();
    const type = TYPES[ext];
    if (!type) throw new BadRequestException(MSG_TYPE);
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException(`Each document must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller.`);
    if (!file.buffer?.length) throw new BadRequestException("That file is empty.");
    if (!signatureMatches(type.kind, file.buffer)) throw new BadRequestException(`That file's contents do not match its ${ext} type. Re-export it and try again.`);

    const existing = await this.files.find({ where: { entityType: kind, entityId }, select: { id: true, size: true } });
    if (existing.length >= MAX_FILES) throw new BadRequestException(`A Data Room holds at most ${MAX_FILES} documents. Delete one to add another.`);
    if (existing.reduce((a, r) => a + r.size, 0) + file.size > MAX_TOTAL_BYTES) throw new BadRequestException(`This would exceed the ${MAX_TOTAL_BYTES / 1024 / 1024} MB Data Room limit. Delete a document to make room.`);

    const fileName = safeFileName(file.originalname);
    const saved = await this.files.save(this.files.create({
      entityType: kind, entityId, name: (dto.name ?? "").trim() || fileName.replace(/\.[^.]+$/, "") || fileName, category: dto.category,
      fileName, mimeType: type.mime, size: file.size, data: file.buffer, uploadedByUserId: userId,
    }));
    await this.syncChecklist(kind, entityId, dto.category);
    return view(saved);
  }

  async update(kind: EntityKind, entityId: string, fileId: string, dto: { category?: string; name?: string }): Promise<DataRoomFileView> {
    const row = await this.find(kind, entityId, fileId);
    const oldCategory = row.category;
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException("A document needs a name.");
      row.name = dto.name.trim();
    }
    if (dto.category !== undefined) row.category = dto.category;
    const saved = await this.files.save(row);
    if (oldCategory !== saved.category) {
      await this.syncChecklist(kind, entityId, oldCategory);
      await this.syncChecklist(kind, entityId, saved.category);
    }
    return view(saved);
  }

  async remove(kind: EntityKind, entityId: string, fileId: string): Promise<void> {
    const row = await this.find(kind, entityId, fileId);
    await this.files.delete(row.id);
    await this.syncChecklist(kind, entityId, row.category);
  }

  async download(kind: EntityKind, entityId: string, fileId: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await this.files.createQueryBuilder("f").addSelect("f.data").where("f.id = :fileId AND f.entityType = :kind AND f.entityId = :entityId", { fileId, kind, entityId }).getOne();
    if (!row) throw new NotFoundException("Document not found");
    return { fileName: row.fileName, mimeType: row.mimeType, data: row.data };
  }

  private async find(kind: EntityKind, entityId: string, fileId: string): Promise<DataRoomFile> {
    const row = await this.files.findOne({ where: { id: fileId, entityType: kind, entityId } });
    if (!row) throw new NotFoundException("Document not found");
    return row;
  }

  /** Keeps the profile's document checklist honest: a checklist document is "On file" exactly when at least one file of that category exists. */
  private async syncChecklist(kind: EntityKind, entityId: string, category: string): Promise<void> {
    if (!(CHECKLIST_CATEGORIES as readonly string[]).includes(category)) return;
    const has = (await this.files.count({ where: { entityType: kind, entityId, category } })) > 0;
    const ref = await this.documents.findOne({ where: { entityType: kind, entityId, name: category } });
    if (ref) {
      if (ref.onFile !== has) await this.documents.save({ ...ref, onFile: has });
    } else if (has) {
      await this.documents.save(this.documents.create({ entityType: kind, entityId, name: category, onFile: true }));
    }
  }
}
