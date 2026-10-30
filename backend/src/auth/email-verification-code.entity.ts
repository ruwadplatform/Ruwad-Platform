import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { User } from "../users/user.entity";

/** One row per verification code that was issued. The code itself is never stored: only `codeHash`, a keyed HMAC (see otp-logic.ts), so a database read
 * cannot be turned back into a working code. A row is live while it is unconsumed, unsuperseded, unexpired and under its attempt limit. */
@Entity("email_verification_codes")
@Index("IDX_email_verification_codes_user_created", ["userId", "createdAt"])
export class EmailVerificationCode extends BaseEntity {
  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ type: "varchar", length: 64 })
  codeHash!: string;

  @Index("IDX_email_verification_codes_expires")
  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  /** Wrong guesses so far. Reaching `maxAttempts` burns the code. */
  @Column({ type: "smallint", default: 0 })
  attempts!: number;

  @Column({ type: "smallint", default: 5 })
  maxAttempts!: number;

  /** Set once, atomically, when the right code is entered: a code can be used only once. */
  @Column({ type: "timestamptz", nullable: true })
  consumedAt?: Date | null;

  /** Set when a newer code replaces this one, or when its attempts run out. */
  @Column({ type: "timestamptz", nullable: true })
  supersededAt?: Date | null;

  /** Keyed hash of the requesting address, kept only to cap codes per address. */
  @Column({ type: "varchar", length: 64, nullable: true })
  ipHash?: string | null;

  /** SENT, FAILED, or null while the email is still being handed to the provider. */
  @Column({ type: "varchar", length: 8, nullable: true })
  deliveryResult?: "SENT" | "FAILED" | null;
}
