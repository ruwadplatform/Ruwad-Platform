import { Module } from "@nestjs/common";
import { ResumeParseController } from "./resume-parse.controller";
import { ResumeParseService } from "./resume-parse.service";

@Module({
  controllers: [ResumeParseController],
  providers: [ResumeParseService],
})
export class ResumeParseModule {}
