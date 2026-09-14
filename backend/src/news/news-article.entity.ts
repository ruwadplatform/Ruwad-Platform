import { Column, Entity } from "typeorm";
import { BaseEntity } from "../common/base.entity";

@Entity("news_articles")
export class NewsArticle extends BaseEntity {
  @Column() title!: string;
  @Column() source!: string;
  @Column({ type: "date" }) publishedDate!: string;
  @Column() category!: string;
  @Column() sector!: string;
  @Column() geography!: string;
  @Column({ type: "text" }) summary!: string;
  @Column() sourceUrl!: string;
}
