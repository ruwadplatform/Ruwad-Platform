import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("hub_programs")
export class HubProgram extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  hubId!: string;

  @Column() name!: string;
  @Column() type!: string;
  @Column() status!: string;
  @Column() duration!: string;
  @Column() location!: string;
  @Column() format!: string;
  @Column() deadline!: string;
  @Column() cohortSize!: string;
}
