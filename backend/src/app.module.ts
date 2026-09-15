import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { ActivityModule } from "./activity/activity.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { DirectorySharedModule } from "./directory-shared/directory-shared.module";
import { InvestmentsModule } from "./investments/investments.module";
import { StartupsModule } from "./startups/startups.module";
import { InvestorsModule } from "./investors/investors.module";
import { HubsModule } from "./hubs/hubs.module";
import { ResearchModule } from "./research/research.module";
import { MultinationalsModule } from "./multinationals/multinationals.module";
import { ReportsModule } from "./reports/reports.module";
import { NewsModule } from "./news/news.module";
import { EventsModule } from "./events/events.module";
import { WatchlistsModule } from "./watchlists/watchlists.module";
import { SavedSearchesModule } from "./saved-searches/saved-searches.module";
import { IntroductionsModule } from "./introductions/introductions.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { UploadsModule } from "./uploads/uploads.module";
import { ResumeParseModule } from "./resume-parse/resume-parse.module";
import { DataRoomModule } from "./data-room/data-room.module";
import { AnalyticsModule } from "./analytics/analytics.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    ActivityModule,
    UsersModule,
    AuthModule,
    DirectorySharedModule,
    InvestmentsModule,
    StartupsModule,
    InvestorsModule,
    HubsModule,
    ResearchModule,
    MultinationalsModule,
    ReportsModule,
    NewsModule,
    EventsModule,
    WatchlistsModule,
    SavedSearchesModule,
    IntroductionsModule,
    OrganizationsModule,
    SubmissionsModule,
    UploadsModule,
    ResumeParseModule,
    DataRoomModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
