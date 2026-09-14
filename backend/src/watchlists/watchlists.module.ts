import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WatchlistItem } from "./watchlist-item.entity";
import { WatchlistsService } from "./watchlists.service";
import { WatchlistsController } from "./watchlists.controller";
import { ActivityModule } from "../activity/activity.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [TypeOrmModule.forFeature([WatchlistItem]), ActivityModule, OrganizationsModule],
  providers: [WatchlistsService],
  controllers: [WatchlistsController],
  exports: [WatchlistsService],
})
export class WatchlistsModule {}
