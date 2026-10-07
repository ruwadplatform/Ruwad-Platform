import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { OwnershipGuard } from "../common/guards/ownership.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { OwnedEntity } from "../common/decorators/owned-entity.decorator";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { EntityKind, UserRole } from "../common/enums";
import { DataRoomFilesService, MAX_FILE_BYTES } from "./data-room-files.service";
import { UpdateDataRoomFileDto, UploadDataRoomFileDto } from "./dto/data-room-file.dto";

/** A startup's own document store. Every route requires the caller to own THIS startup (or be a platform admin); documents are private to them. */
@ApiTags("data-room")
@ApiCookieAuth()
@Controller("startups/:id/data-room/files")
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles(UserRole.FOUNDER, UserRole.ORGANIZATION_ADMIN, UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
@OwnedEntity(EntityKind.STARTUP)
export class DataRoomFilesController {
  constructor(private readonly service: DataRoomFilesService) {}

  @Get()
  list(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.list(EntityKind.STARTUP, id);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 } }))
  upload(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadDataRoomFileDto) {
    return this.service.upload(EntityKind.STARTUP, id, user.userId, file, dto);
  }

  @Get(":fileId/download")
  async download(@Param("id", ParseUUIDPipe) id: string, @Param("fileId", ParseUUIDPipe) fileId: string, @Res() res: Response) {
    const f = await this.service.download(EntityKind.STARTUP, id, fileId);
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.attachment(f.fileName); // always a download, never rendered inline from this origin
    res.send(f.data);
  }

  @Patch(":fileId")
  update(@Param("id", ParseUUIDPipe) id: string, @Param("fileId", ParseUUIDPipe) fileId: string, @Body() dto: UpdateDataRoomFileDto) {
    return this.service.update(EntityKind.STARTUP, id, fileId, dto);
  }

  @Delete(":fileId")
  async remove(@Param("id", ParseUUIDPipe) id: string, @Param("fileId", ParseUUIDPipe) fileId: string) {
    await this.service.remove(EntityKind.STARTUP, id, fileId);
    return { deleted: true };
  }
}
