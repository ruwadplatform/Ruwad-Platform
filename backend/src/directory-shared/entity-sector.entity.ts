import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** Many-to-many join: one startup/investor/hub/research/multinational can
 * have several healthcare-focus sectors, and a sector obviously spans many
 * entities — this is exactly the kind of relationship a JSON array column
 * would hide from the query planner (e.g. Sector Distribution analytics). */
@Entity("entity_sectors")
@Index(["entityType", "entityId", "sectorId"], { unique: true })
export class EntitySector extends BaseEntity {
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Index()
  @Column({ type: "uuid" })
  sectorId!: string;
}
