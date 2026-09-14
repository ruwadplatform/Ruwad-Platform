import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** Every child table below belongs to exactly one research institution
 * (researchInstitutionId FK) — kept in one file since they're small and
 * always read/written together, rather than six near-empty files. */

@Entity("research_projects")
export class ResearchProject extends BaseEntity {
  @Index() @Column({ type: "uuid" }) researchInstitutionId!: string;
  @Column() title!: string;
  @Column() area!: string;
  @Column() status!: string;
  @Column({ type: "int" }) startYear!: number;
  @Column("text", { array: true, default: [] }) partners!: string[];
}

@Entity("publications")
export class Publication extends BaseEntity {
  @Index() @Column({ type: "uuid" }) researchInstitutionId!: string;
  @Column() title!: string;
  @Column() area!: string;
  @Column() authors!: string;
  @Column() journal!: string;
  @Column({ type: "int" }) year!: number;
}

@Entity("research_technologies")
export class ResearchTechnology extends BaseEntity {
  @Index() @Column({ type: "uuid" }) researchInstitutionId!: string;
  @Column() name!: string;
  @Column() area!: string;
  @Column({ type: "int" }) trl!: number;
  @Column() status!: string;
}

@Entity("researchers")
export class Researcher extends BaseEntity {
  @Index() @Column({ type: "uuid" }) researchInstitutionId!: string;
  @Column() name!: string;
  @Column() title!: string;
  @Column() area!: string;
}
