import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** One emailed review link. Only the SHA-256 of the token is stored, so the database alone can't be used to approve a
 * report. Single use: `usedAt` is set the moment a decision is made (or the link is replaced by a resent one). */
@Entity("report_review_tokens")
export class ReportReviewToken extends BaseEntity {
  @Index() @Column({ type: "uuid" }) submissionId!: string;
  @Index({ unique: true }) @Column() tokenHash!: string;
  @Column({ type: "timestamptz" }) expiresAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) usedAt?: Date | null;
}
