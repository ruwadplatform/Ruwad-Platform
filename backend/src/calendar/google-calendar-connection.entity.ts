import { Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { User } from "../users/user.entity";

export type GoogleConnectionStatus = "active" | "reauth_required";

/** One Google Calendar connection per RUWĀD user. Tokens are stored encrypted
 * (see token-crypto.ts) and never leave the backend — no API returns them and
 * they are never logged. */
@Entity("google_calendar_connections")
export class GoogleCalendarConnection extends BaseEntity {
  /** Unique (one connection per user) — enforced by the one-to-one relation below. */
  @Column({ type: "uuid" })
  userId!: string;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId", foreignKeyConstraintName: "FK_google_calendar_connections_user" })
  user?: User;

  /** The verified Google account email (must equal the RUWĀD account email). */
  @Column()
  googleEmail!: string;

  @Column({ type: "text" })
  refreshTokenEnc!: string;

  @Column({ type: "text", nullable: true })
  accessTokenEnc?: string | null;

  @Column({ type: "timestamptz", nullable: true })
  accessTokenExpiresAt?: Date | null;

  /** Scope Google actually granted. */
  @Column({ type: "text" })
  scope!: string;

  @Column({ type: "varchar", default: "active" })
  status!: GoogleConnectionStatus;

  @Column({ type: "timestamptz" })
  connectedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt?: Date | null;
}
