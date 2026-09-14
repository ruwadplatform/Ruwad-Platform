import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** The real relational link between an investor and what it has invested
 * in — an investor's "Portfolio"/"Recent Investments" is derived by
 * querying this table joined against startups/multinationals, never by
 * duplicating company records inside the investor row. */
@Entity("investments")
export class Investment extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  investorId!: string;

  @Column({ type: "enum", enum: EntityKind })
  targetEntityType!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  targetEntityId!: string;

  @Column({ nullable: true })
  round?: string;

  @Column({ type: "int", nullable: true })
  year?: number;
}
