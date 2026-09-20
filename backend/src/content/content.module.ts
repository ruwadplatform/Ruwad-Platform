import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NewsArticle } from "../news/news-article.entity";
import { Event } from "../events/event.entity";
import { ContentSyncRun } from "./content-sync-run.entity";
import { SerperClient } from "./serper.client";
import { NewsHarvestService } from "./news-harvest.service";
import { EventsHarvestService } from "./events-harvest.service";
import { ContentRefreshService } from "./content-refresh.service";
import { ContentRefreshController } from "./content-refresh.controller";

/** Automatic collection of real healthcare news and events (Serper → backend
 * → database). Nothing here is reachable from the frontend except through the
 * existing read-only /news and /events endpoints. */
@Module({
  imports: [TypeOrmModule.forFeature([NewsArticle, Event, ContentSyncRun])],
  providers: [SerperClient, NewsHarvestService, EventsHarvestService, ContentRefreshService],
  controllers: [ContentRefreshController],
  exports: [ContentRefreshService],
})
export class ContentModule {}
