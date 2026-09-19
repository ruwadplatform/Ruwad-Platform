import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UploadedImage } from "./uploaded-image.entity";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — a logo, never a document
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_PURPOSE = "AVATAR";

/** Identifies a raster image from its leading bytes, never from the client's
 * filename or declared Content-Type (both are attacker-controlled). Only
 * PNG, JPEG and WebP are recognised — SVG (which can carry script) and
 * everything else return null. */
function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(UploadedImage) private readonly repo: Repository<UploadedImage>,
  ) {}

  async saveLogo(file: Express.Multer.File | undefined, userId: string): Promise<{ id: string }> {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Logo must be a PNG, JPEG, WebP or SVG image");
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException("Logo must be 2MB or smaller");
    }
    const saved = await this.repo.save(this.repo.create({
      mimeType: file.mimetype,
      data: file.buffer,
      size: file.size,
      uploadedByUserId: userId,
    }));
    return { id: saved.id };
  }

  /** Profile photo upload: stricter than logos — the type is decided by the
   * file's actual bytes (PNG/JPEG/WebP only, no SVG) and the stored
   * Content-Type is the sniffed one, so a mislabelled file can't be served
   * as something it isn't. */
  async saveAvatar(file: Express.Multer.File | undefined, userId: string): Promise<{ id: string }> {
    if (!file) throw new BadRequestException("No file uploaded");
    if (file.size > AVATAR_MAX_BYTES) throw new BadRequestException("Profile photo must be 2 MB or smaller.");
    const type = sniffImageType(file.buffer);
    if (!type) throw new BadRequestException("Profile photo must be a PNG, JPG or WebP image.");
    const saved = await this.repo.save(this.repo.create({
      mimeType: type,
      data: file.buffer,
      size: file.size,
      uploadedByUserId: userId,
      purpose: AVATAR_PURPOSE,
    }));
    return { id: saved.id };
  }

  /** Throws unless `imageId` is an avatar this user uploaded themselves. */
  async assertOwnAvatar(imageId: string, userId: string): Promise<void> {
    const image = await this.repo.findOne({ where: { id: imageId }, select: { id: true, uploadedByUserId: true, purpose: true } });
    if (!image || image.purpose !== AVATAR_PURPOSE || image.uploadedByUserId !== userId) {
      throw new BadRequestException("That image can't be used as a profile photo.");
    }
  }

  /** Removes a superseded avatar row. Scoped to purpose AVATAR + owner so it
   * can never delete a directory logo. */
  async deleteOwnAvatar(imageId: string, userId: string): Promise<void> {
    await this.repo.delete({ id: imageId, uploadedByUserId: userId, purpose: AVATAR_PURPOSE });
  }

  async find(id: string): Promise<UploadedImage> {
    const image = await this.repo.findOne({ where: { id } });
    if (!image) throw new NotFoundException("Image not found");
    return image;
  }
}
