import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Hub } from "./hub.entity";
import { HubProgram } from "./hub-program.entity";
import { HubPortfolioItem } from "./hub-portfolio-item.entity";
import { HubsService } from "./hubs.service";
import { HubsController } from "./hubs.controller";
import { DirectorySharedModule } from "../directory-shared/directory-shared.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [TypeOrmModule.forFeature([Hub, HubProgram, HubPortfolioItem]), DirectorySharedModule, OrganizationsModule],
  providers: [HubsService],
  controllers: [HubsController],
  exports: [HubsService, TypeOrmModule],
})
export class HubsModule {}
