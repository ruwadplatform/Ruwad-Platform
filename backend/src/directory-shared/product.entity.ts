import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** Used by startups and multinationals (the two entity types with a
 * product catalog in the frontend model). */
@Entity("products")
export class ProductRef extends BaseEntity {
  @Index()
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Column()
  name!: string;

  @Column()
  category!: string;

  @Column({ type: "text" })
  description!: string;
}
