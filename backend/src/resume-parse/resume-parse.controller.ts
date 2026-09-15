import { Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { ResumeParseService } from "./resume-parse.service";

@ApiTags("resume-parse")
@Controller("resume-parse")
export class ResumeParseController {
  constructor(private readonly service: ResumeParseService) {}

  /** Public and unauthenticated — called from the signup wizard before an
   * account exists. Throttled tightly since every call spends real LLM API
   * credits, unlike the rest of the throttle defaults in this app. */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  parse(@UploadedFile() file: Express.Multer.File) {
    return this.service.parse(file);
  }
}
