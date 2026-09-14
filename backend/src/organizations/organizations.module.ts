import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EntityMembership } from "./entity-membership.entity";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { Startup } from "../startups/startup.entity";
import { Investor } from "../investors/investor.entity";
import { Hub } from "../hubs/hub.entity";
import { ResearchInstitution } from "../research/research-institution.entity";
import { Multinational } from "../multinationals/multinational.entity";

@Module({
  imports: [TypeOrmModule.forFeature([EntityMembership, Startup, Investor, Hub, ResearchInstitution, Multinational])],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService, TypeOrmModule],
})
export class OrganizationsModule {}
