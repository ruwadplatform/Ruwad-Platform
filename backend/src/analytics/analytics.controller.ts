import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("ecosystem-snapshot")
  ecosystemSnapshot() {
    return this.analyticsService.ecosystemSnapshot();
  }

  @Get("overview")
  overview() {
    return this.analyticsService.overview();
  }

  @Get("funding-by-stage")
  fundingByStage() {
    return this.analyticsService.fundingByStage();
  }

  @Get("sector-distribution")
  sectorDistribution() {
    return this.analyticsService.sectorDistribution();
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
