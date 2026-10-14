import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiSummary } from "./ai-summary.entity";
import { AiSummariesController } from "./ai-summaries.controller";
import { AiSummariesService } from "./ai-summaries.service";
import { AiSummaryGenerator } from "./ai-summary-generator";
import { Startup } from "../startups/startup.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { HubProgram } from "../hubs/hub-program.entity";
import { Multinational } from "../multinationals/multinational.entity";
import { DirectorySharedModule } from "../directory-shared/directory-shared.module";

@Module({
  imports: [TypeOrmModule.forFeature([AiSummary, Startup, Investor, Hub, HubProgram, Multinational]), DirectorySharedModule],
  providers: [AiSummariesService, AiSummaryGenerator],
  controllers: [AiSummariesController],
})
export class AiSummariesModule {}
