import { Column, Entity } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("events")
export class Event extends BaseEntity {
  @Column() name!: string;
  @Column({ type: "date" }) date!: string;
  @Column() location!: string;
  @Column() country!: string;
  @Column() type!: string;
  @Column() sector!: string;
  @Column() organizer!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ type: "varchar", default: "Open" }) registrationStatus!: "Open" | "Closed" | "Coming Soon";
  @Column() url!: string;
}
