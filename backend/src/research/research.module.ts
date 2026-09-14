import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ResearchInstitution } from "./research-institution.entity";
import { ResearchProject, Publication, ResearchTechnology, Researcher } from "./research-child-entities.entity";
import { ResearchService } from "./research.service";
import { ResearchController } from "./research.controller";
import { DirectorySharedModule } from "../directory-shared/directory-shared.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [TypeOrmModule.forFeature([ResearchInstitution, ResearchProject, Publication, ResearchTechnology, Researcher]), DirectorySharedModule, OrganizationsModule],
  providers: [ResearchService],
  controllers: [ResearchController],
  exports: [ResearchService, TypeOrmModule],
})
export class ResearchModule {}
