import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";
import { Personalized, ViewerCtx } from "../visibility/personalized";
import { Viewer, baseAccess } from "../visibility/viewer";
import { analyticsFundingByStage, analyticsOverview, analyticsSectorDistribution } from "../visibility/field-policy";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("ecosystem-snapshot")
  ecosystemSnapshot() {
    return this.analyticsService.ecosystemSnapshot();
  }

  @Get("overview")
  @Personalized()
  async overview(@ViewerCtx() viewer: Viewer) {
    return analyticsOverview(await this.analyticsService.overview(), baseAccess(viewer));
  }

  @Get("funding-by-stage")
  @Personalized()
  async fundingByStage(@ViewerCtx() viewer: Viewer) {
    return analyticsFundingByStage(await this.analyticsService.fundingByStage(), baseAccess(viewer));
  }

  @Get("sector-distribution")
  @Personalized()
  async sectorDistribution(@ViewerCtx() viewer: Viewer) {
    return analyticsSectorDistribution(await this.analyticsService.sectorDistribution(), baseAccess(viewer));
  }

  @Get("geographic-distribution")
  geographicDistribution() {
    return this.analyticsService.geographicDistribution();
  }

  @Get("investor-activity")
  investorActivity() {
    return this.analyticsService.investorActivity();
  }

  @Get("research")
  research() {
    return this.analyticsService.researchAnalytics();
  }

  @Get("multinationals")
  multinationals() {
    return this.analyticsService.multinationalsAnalytics();
  }
}
