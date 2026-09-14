import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { ActivityType } from "../common/enums";

@Entity("activity_logs")
export class ActivityLog extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: ActivityType })
  type!: ActivityType;

  @Column()
  text!: string;

  @Column({ nullable: true })
  route?: string;
}
