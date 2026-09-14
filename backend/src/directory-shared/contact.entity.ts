import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** One contact record per entity (1:1, not many-to-many — a startup has
 * exactly one contact block) — a real table rather than a JSONB blob
 * because contact visibility is gated per-viewer (ContactLock) and it's
 * simpler to reason about as normal columns. `extra` holds the handful of
 * per-type fields (e.g. a research institution's techTransferOffice
 * email) that don't apply to every entity type. */
@Entity("contacts")
@Index(["entityType", "entityId"], { unique: true })
export class Contact extends BaseEntity {
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Column({ type: "uuid" })
  entityId!: string;

  @Column({ nullable: true })
  mainContact?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ nullable: true })
  linkedin?: string;

  @Column({ type: "jsonb", nullable: true })
  extra?: Record<string, string>;
}
