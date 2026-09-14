import { Column, Entity, Index, Unique } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { WatchlistKind } from "../common/enums";

@Entity("watchlist_items")
@Unique(["userId", "kind", "entityId"])
export class WatchlistItem extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: WatchlistKind })
  kind!: WatchlistKind;

  @Column({ type: "uuid" })
  entityId!: string;
}
