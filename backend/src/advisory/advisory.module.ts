import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from "../email/email.module";
import { EntityMembership } from "../organizations/entity-membership.entity";
import { Startup } from "../startups/startup.entity";
import { User } from "../users/user.entity";
import { AdvisoryAdminService } from "./advisory-admin.service";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { AdvisoryAutomationService } from "./advisory-automation.service";
import { AdvisoryBookingsService } from "./advisory-bookings.service";
import { AdvisoryMeetingService } from "./advisory-meeting.service";
import { AdvisoryNotifier } from "./advisory-notifier";
import { DailyVideoProvider } from "./video/daily-video-provider";
import { MockVideoProvider } from "./video/mock-video-provider";
import { VIDEO_PROVIDER } from "./video/video-provider";
import { readVideoConfig } from "./video/video-config";
import { AdvisoryAdminController, AdvisoryAdvisorController, AdvisoryBookingsController, AdvisoryPublicController } from "./advisory.controllers";
import { AdvisoryAdvisor, AdvisoryAvailabilityException, AdvisoryAvailabilityRule, AdvisoryBooking, AdvisoryBookingEvent, AdvisoryMeetingAttendance, AdvisoryService, AdvisoryWebhookEvent } from "./advisory.entities";
import { AdvisoryEnabledGuard, ApprovedAdvisorGuard } from "./advisory.guards";

/** Advisory Services: advisors, their services and availability, and consultation bookings. Inert unless ADVISORY_ENABLED=true (every route 404s). */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdvisoryAdvisor, AdvisoryService, AdvisoryAvailabilityRule, AdvisoryAvailabilityException, AdvisoryBooking, AdvisoryBookingEvent, AdvisoryMeetingAttendance, AdvisoryWebhookEvent, EntityMembership, Startup, User]),
    EmailModule,
  ],
  providers: [AdvisoryAdvisorsService, AdvisoryBookingsService, AdvisoryAdminService, AdvisoryAutomationService, AdvisoryMeetingService, AdvisoryNotifier,
    {
      // Simulated rooms unless Daily was asked for AND has credentials. "daily" without credentials stays unusable (the meeting service reports it as not set up).
      provide: VIDEO_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const cfg = readVideoConfig((k) => config.get<string>(k));
        return cfg.requested === "daily" && cfg.configured
          ? new DailyVideoProvider({ apiKey: cfg.dailyApiKey, domain: cfg.dailyDomain, apiBase: cfg.dailyApiBase, timeoutMs: cfg.timeoutMs })
          : new MockVideoProvider();
      },
    }, AdvisoryEnabledGuard, ApprovedAdvisorGuard],
  controllers: [AdvisoryPublicController, AdvisoryBookingsController, AdvisoryAdvisorController, AdvisoryAdminController],
  exports: [AdvisoryAdvisorsService, AdvisoryBookingsService, AdvisoryMeetingService],
})
export class AdvisoryModule {}
