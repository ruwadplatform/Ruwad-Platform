import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { IntroductionStatus } from "../common/enums";

export interface IntroStatusEvent {
  status: IntroductionStatus;
  date: string;
}

@Entity("introductions")
export class Introduction extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: IntroductionStatus, default: IntroductionStatus.PENDING })
  status!: IntroductionStatus;

  @Column({ nullable: true })
  investor?: string;

  @Column({ nullable: true })
  startup?: string;

  @Column({ nullable: true })
  reasonType?: string;

  @Column({ type: "text", nullable: true })
  reason?: string;

  @Column({ type: "text", nullable: true })
  message?: string;

  @Column({ type: "jsonb", default: [] })
  statusHistory!: IntroStatusEvent[];
}
