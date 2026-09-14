import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { User } from "./user.entity";

@Entity("user_settings")
export class UserSettings extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "uuid" })
  userId!: string;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ default: true })
  emailNotifications!: boolean;

  @Column({ default: true })
  introRequestAlerts!: boolean;

  @Column({ default: true })
  savedSearchAlerts!: boolean;

  @Column({ default: false })
  weeklyDigest!: boolean;

  @Column({ default: true })
  profileVisibleToGuests!: boolean;

  @Column({ default: false })
  showContactInfo!: boolean;
}
