import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { UserRole, UserStatus } from "../common/enums";

@Entity("users")
export class User extends BaseEntity {
  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Index({ unique: true })
  @Column()
  email!: string;

  /** Never serialized back to the client — excluded via class-transformer
   * @Exclude() on the response DTO, not by omitting it from the entity. */
  @Column()
  passwordHash!: string;

  @Column({ nullable: true })
  jobTitle?: string;

  @Column({ nullable: true })
  organization?: string;

  @Column({ nullable: true })
  organizationWebsite?: string;

  @Column({ nullable: true })
  organizationStage?: string;

  @Column({ nullable: true })
  organizationCategory?: string;

  @Column({ nullable: true })
  organizationCity?: string;

  @Column({ nullable: true })
  organizationType?: string;

  @Column({ type: "text", array: true, default: () => "'{}'" })
  interests!: string[];

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ type: "text", nullable: true })
  bio?: string;

  @Column({ nullable: true })
  linkedin?: string;

  /** Optional profile photo: the id of an `uploaded_images` row with
   * purpose AVATAR (same storage as directory logos). Null = initials. */
  @Column({ type: "uuid", nullable: true })
  profileImageId?: string | null;

  @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: "enum", enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;
}
