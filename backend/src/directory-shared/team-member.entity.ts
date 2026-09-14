import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

@Entity("team_members")
export class TeamMember extends BaseEntity {
  @Index()
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Column()
  name!: string;

  @Column()
  title!: string;

  @Column({ default: false })
  isFounder!: boolean;
}
