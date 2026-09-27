import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

/** A user's request to be recognized as the owner/representative of a directory listing (Startup, Investor, Hub,
 * Research institution or Multinational). Approving one creates the matching `EntityMembership` (role OWNER) — this
 * table only tracks the request and its review, never ownership itself, so "who owns what" always has one source. */
@Entity("listing_claims")
export class ListingClaim extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: EntityKind })
  kind!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  /** The claimant's stated role at the company (e.g. "Founder & CEO") — not to be confused with MembershipRole. */
  @Column() role!: string;
  /** How RUWĀD can verify the claimant is affiliated (e.g. company email domain, LinkedIn profile). */
  @Column({ type: "text", default: "" }) note!: string;

  @Column({ type: "varchar", default: "PENDING" }) status!: ClaimStatus;

  @Column({ type: "timestamptz", nullable: true }) reviewedAt?: Date | null;
  @Column({ type: "uuid", nullable: true }) reviewedByUserId?: string | null;
  @Column({ type: "text", nullable: true }) rejectionReason?: string | null;
}
