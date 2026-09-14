import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Sector } from "./sector.entity";
import { EntitySector } from "./entity-sector.entity";
import { TeamMember } from "./team-member.entity";
import { DocumentRef } from "./document-ref.entity";
import { Contact } from "./contact.entity";
import { Partnership } from "./partnership.entity";
import { ProductRef } from "./product.entity";
import { DirectorySharedService } from "./directory-shared.service";

@Module({
  imports: [TypeOrmModule.forFeature([Sector, EntitySector, TeamMember, DocumentRef, Contact, Partnership, ProductRef])],
  providers: [DirectorySharedService],
  exports: [DirectorySharedService, TypeOrmModule],
})
export class DirectorySharedModule {}
