import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Multinational } from "./multinational.entity";
import { MultinationalsService } from "./multinationals.service";
import { MultinationalsController } from "./multinationals.controller";
import { DirectorySharedModule } from "../directory-shared/directory-shared.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [TypeOrmModule.forFeature([Multinational]), DirectorySharedModule, OrganizationsModule],
  providers: [MultinationalsService],
  controllers: [MultinationalsController],
  exports: [MultinationalsService, TypeOrmModule],
})
export class MultinationalsModule {}
