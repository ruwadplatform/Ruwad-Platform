import { Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../common/decorators/current-user.decorator";
import { UploadsService } from "./uploads.service";

@ApiTags("uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("logo")
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.uploadsService.saveLogo(file, user.userId);
  }

  /** Public and unauthenticated — a published logo is meant to be visible
   * to every visitor, same as any other directory-listing field. Immutable
   * once uploaded (a re-upload gets a new id, never overwrites this one),
   * so a long-lived cache header is safe. */
  @Get(":id")
  async serve(@Param("id") id: string, @Res() res: Response) {
    const image = await this.uploadsService.find(id);
    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(image.data);
  }
}
