import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../../common/base.entity";
import { IdentityMatchedBy, IdentityMatchStatus } from "../../common/enums";
import { numericTransformer } from "../../common/numeric.transformer";

/** Maps one external record ("Linus Bio" on MAGNiTT, externalId 8841) to a
 * RUWĀD Startup row — or, until an admin resolves it, to nothing yet
 * (startupId stays null while matchStatus is UNMATCHED/REVIEW_REQUIRED/
 * POSSIBLE_DUPLICATE). Never auto-merged into an existing Startup on a
 * fuzzy name match alone — see StartupIdentityMatchingService. */
@Entity("startup_external_identities")
export class StartupExternalIdentity extends BaseEntity {
  @Index()
  @Column({ type: "uuid", nullable: true })
  startupId?: string;

  @Column()
  sourceName!: string;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ nullable: true })
  externalUrl?: string;

  @Column()
  companyNameAtSource!: string;

  @Column({ nullable: true })
  domain?: string;

  @Column({ type: "enum", enum: IdentityMatchedBy, nullable: true })
  matchedBy?: IdentityMatchedBy;

  @Column({ type: "numeric", precision: 3, scale: 2, nullable: true, transformer: numericTransformer })
  matchConfidence?: number;

  @Column({ type: "enum", enum: IdentityMatchStatus, default: IdentityMatchStatus.REVIEW_REQUIRED })
  matchStatus!: IdentityMatchStatus;

  /** An admin has explicitly confirmed this mapping — once true, future
   * imports referencing the same externalId/sourceName pair auto-match at
   * the strongest tier without re-review. */
  @Column({ default: false })
  verified!: boolean;
}
