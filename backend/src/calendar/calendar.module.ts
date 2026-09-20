import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { Event } from "../events/event.entity";
import { GoogleCalendarConnection } from "./google-calendar-connection.entity";
import { CalendarEventLink } from "./calendar-event-link.entity";
import { GoogleCalendarService } from "./google-calendar.service";
import { GoogleCalendarController } from "./google-calendar.controller";

/** "Add to Calendar" straight into a user's Google Calendar (OAuth 2.0). */
@Module({
  imports: [TypeOrmModule.forFeature([GoogleCalendarConnection, CalendarEventLink, Event, User])],
  providers: [GoogleCalendarService],
  controllers: [GoogleCalendarController],
})
export class CalendarModule {}
