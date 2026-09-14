import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SavedSearch } from "./saved-search.entity";
import { SavedSearchesService } from "./saved-searches.service";
import { SavedSearchesController } from "./saved-searches.controller";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([SavedSearch]), ActivityModule],
  providers: [SavedSearchesService],
  controllers: [SavedSearchesController],
  exports: [SavedSearchesService],
})
export class SavedSearchesModule {}
