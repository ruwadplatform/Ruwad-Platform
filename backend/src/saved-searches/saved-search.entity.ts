import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("saved_searches")
export class SavedSearch extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column()
  entityType!: string;

  @Column()
  label!: string;

  @Column({ default: "" })
  search!: string;

  @Column({ type: "jsonb", default: {} })
  filters!: Record<string, string[]>;

  @Column({ type: "int", default: 0 })
  resultCountAtSave!: number;

  @Column({ type: "timestamptz", nullable: true })
  lastRunAt?: Date;

  @Column({ default: false })
  alertEnabled!: boolean;
}
