import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UploadedImage } from "./uploaded-image.entity";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — a logo, never a document

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

  async find(id: string): Promise<UploadedImage> {
    const image = await this.repo.findOne({ where: { id } });
    if (!image) throw new NotFoundException("Image not found");
    return image;
  }
}
