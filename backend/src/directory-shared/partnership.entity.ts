import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

@Entity("partnerships")
export class Partnership extends BaseEntity {
  @Index()
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Column()
  type!: string;

  @Column()
  partnerName!: string;

  @Column({ type: "text" })
  description!: string;
}
