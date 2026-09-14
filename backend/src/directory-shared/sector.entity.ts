import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** Lookup table for the fixed healthcare-category taxonomy (the frontend's
 * HC_CATEGORIES list) — entities attach to sectors via EntitySector so
 * "which sectors does this hub focus on" is a real many-to-many join,
 * not a comma-separated string column. */
@Entity("sectors")
export class Sector extends BaseEntity {
  @Index({ unique: true })
  @Column()
  name!: string;
}
