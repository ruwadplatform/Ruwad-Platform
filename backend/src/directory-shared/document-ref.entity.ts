import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** Document *status* rows only (name + on-file flag), matching the
 * frontend's existing DocumentRef shape ({n, ok}) — not used for
 * Research & Academia (explicit product rule: no Data Room / document
 * machinery for research institutions). Actual file storage is out of
 * scope this phase — see the Data Room module. */
@Entity("entity_documents")
export class DocumentRef extends BaseEntity {
  @Index()
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Column()
  name!: string;

  @Column({ default: false })
  onFile!: boolean;
}
