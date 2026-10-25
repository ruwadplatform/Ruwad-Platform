import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from "../email/email.module";
import { EntityMembership } from "../organizations/entity-membership.entity";
import { Startup } from "../startups/startup.entity";
import { User } from "../users/user.entity";
import { AdvisoryAdminService } from "./advisory-admin.service";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";
import { AdvisoryAutomationService } from "./advisory-automation.service";
import { AdvisoryBookingsService } from "./advisory-bookings.service";
import { AdvisoryNotifier } from "./advisory-notifier";
import { AdvisoryAdminController, AdvisoryAdvisorController, AdvisoryBookingsController, AdvisoryPublicController } from "./advisory.controllers";
import { AdvisoryAdvisor, AdvisoryAvailabilityException, AdvisoryAvailabilityRule, AdvisoryBooking, AdvisoryBookingEvent, AdvisoryMeetingAttendance, AdvisoryService, AdvisoryWebhookEvent } from "./advisory.entities";
import { AdvisoryEnabledGuard, ApprovedAdvisorGuard } from "./advisory.guards";

/** Advisory Services: advisors, their services and availability, and consultation bookings. Inert unless ADVISORY_ENABLED=true (every route 404s). */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdvisoryAdvisor, AdvisoryService, AdvisoryAvailabilityRule, AdvisoryAvailabilityException, AdvisoryBooking, AdvisoryBookingEvent, AdvisoryMeetingAttendance, AdvisoryWebhookEvent, EntityMembership, Startup, User]),
    EmailModule,
  ],
  providers: [AdvisoryAdvisorsService, AdvisoryBookingsService, AdvisoryAdminService, AdvisoryAutomationService, AdvisoryNotifier, AdvisoryEnabledGuard, ApprovedAdvisorGuard],
  controllers: [AdvisoryPublicController, AdvisoryBookingsController, AdvisoryAdvisorController, AdvisoryAdminController],
  exports: [AdvisoryAdvisorsService, AdvisoryBookingsService],
})
export class AdvisoryModule {}
