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

  /** Optional, founder-reported RUWĀD Score inputs (see scoring/
   * feature-derivation.service.ts) — only ever meaningful on rows where
   * isFounder is true, but not DB-constrained to that since a founder can
   * be unchecked/re-checked without losing what they already reported. */
  @Column({ type: "int", nullable: true })
  experienceYears?: number;

  @Column({ type: "int", nullable: true })
  healthcareExperienceYears?: number;

  @Column({ nullable: true })
  previousStartupExperience?: boolean;
}
