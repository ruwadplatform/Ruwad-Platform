import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("events")
@Index("UQ_events_urlKey", ["urlKey"], { unique: true, where: `"urlKey" IS NOT NULL` })
export class Event extends BaseEntity {
  @Column() name!: string;
  /** Legacy single date — kept equal to startDate for older readers. */
  @Column({ type: "date" }) date!: string;
  @Column({ type: "date", nullable: true }) startDate?: string | null;
  @Index()
  @Column({ type: "date", nullable: true }) endDate?: string | null;
  /** Free text ("Riyadh, Saudi Arabia"); empty when the source doesn't say. */
  @Column() location!: string;
  @Column() country!: string;
  @Column({ type: "varchar", nullable: true }) city?: string | null;
  @Column({ type: "varchar", nullable: true }) venue?: string | null;
  @Column() type!: string;
  @Column() sector!: string;
  @Column() organizer!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ type: "varchar", default: "Open" }) registrationStatus!: "Open" | "Closed" | "Coming Soon";
  /** The event's own page. */
  @Column() url!: string;
  @Column({ type: "text", nullable: true }) registrationUrl?: string | null;
  @Column({ type: "text", nullable: true }) imageUrl?: string | null;

  @Column({ type: "varchar", nullable: true }) urlKey?: string | null;
  @Index() @Column({ type: "varchar", nullable: true }) nameKey?: string | null;
  @Column({ default: true }) isPublished!: boolean;
  @Column({ default: false }) isFeatured!: boolean;
  @Column({ default: "manual" }) origin!: string;
  /** How the dates were established: "structured" (schema.org), "text" (one
   * unambiguous date in the page/snippet) or "manual". */
  @Column({ type: "varchar", nullable: true }) dateSource?: string | null;
  @Column({ type: "timestamptz", nullable: true }) lastSeenAt?: Date | null;
}
