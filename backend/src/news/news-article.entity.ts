import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("news_articles")
@Index("UQ_news_articles_urlKey", ["urlKey"], { unique: true, where: `"urlKey" IS NOT NULL` })
@Index("IDX_news_articles_publishedDate", ["publishedDate"])
export class NewsArticle extends BaseEntity {
  @Column() title!: string;
  /** Publisher name (the "sourceName" of the ingestion spec). */
  @Column() source!: string;
  @Column({ type: "date" }) publishedDate!: string;
  @Column() category!: string;
  @Column() sector!: string;
  /** Country the story is about (or a region label: "GCC" / "MENA"). */
  @Column() geography!: string;
  @Column({ type: "text" }) summary!: string;
  /** The ORIGINAL article URL — the app links out to it, never to a copy. */
  @Column() sourceUrl!: string;

  @Column({ type: "text", nullable: true }) imageUrl?: string | null;
  /** Canonical form of sourceUrl (tracking params/www/amp removed): the dedup key. */
  @Column({ type: "varchar", nullable: true }) urlKey?: string | null;
  /** Normalized headline: second dedup signal (same story, different URL). */
  @Index() @Column({ type: "varchar", nullable: true }) titleKey?: string | null;
  /** Hide without deleting; auto-collected items are only published when
   * enough reliable information exists. */
  @Column({ default: true }) isPublished!: boolean;
  @Column({ default: false }) isFeatured!: boolean;
  /** "manual" (admin API) or "serper" (automatic collection). */
  @Column({ default: "manual" }) origin!: string;
  @Column({ type: "timestamptz", nullable: true }) lastSeenAt?: Date | null;
}
