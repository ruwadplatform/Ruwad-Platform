import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

@Entity("news_related_entities")
export class NewsRelatedEntity extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  newsId!: string;

  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Column({ type: "uuid" })
  entityId!: string;

  /** The target entity's route slug, captured at write time so the
   * frontend can link straight to /{type}/{slug} without an extra join
   * per related entity per news article. */
  @Column({ nullable: true })
  entitySlug?: string;

  @Column()
  name!: string;
}
