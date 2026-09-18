import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { User } from "../users/user.entity";

/** One row per reset link that was issued. Only the SHA-256 of the raw token
 * is stored — the raw token exists solely in the emailed link, so a database
 * read can't be turned into a working reset link. `usedAt` is set when the
 * token is consumed or superseded by a newer request. */
@Entity("password_reset_tokens")
export class PasswordResetToken extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Index({ unique: true })
  @Column()
  tokenHash!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  usedAt?: Date | null;
}
