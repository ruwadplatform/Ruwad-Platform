import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { User } from "../users/user.entity";
import { Event } from "../events/event.entity";

/** Records that a user explicitly added an event to their Google Calendar.
 * Unique per (user, event): this is what turns a repeated click into the
 * "✓ Added to Calendar" state instead of a second calendar entry. */
@Entity("calendar_event_links")
@Index("UQ_calendar_event_links_user_event", ["userId", "eventId"], { unique: true })
export class CalendarEventLink extends BaseEntity {
  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_calendar_event_links_user" })
  user?: User;

  @Column({ type: "uuid" })
  eventId!: string;

  @ManyToOne(() => Event, { onDelete: "CASCADE" })
  @JoinColumn({ name: "eventId", foreignKeyConstraintName: "FK_calendar_event_links_event" })
  event?: Event;

  @Column()
  googleEventId!: string;

  @Column({ type: "text", nullable: true })
  htmlLink?: string | null;
}
