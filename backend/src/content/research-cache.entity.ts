import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** One cached Serper answer, keyed by the normalized request. Reports and pitch-deck research read this first,
 * so the same question is never paid for twice within its freshness window. */
@Entity("research_cache")
export class ResearchCache extends BaseEntity {
  @Index("IDX_research_cache_key", { unique: true })
  @Column()
  key!: string;

  @Column({ type: "varchar" })
  kind!: string;

  @Column({ type: "text" })
  query!: string;

  @Column({ type: "jsonb" })
  payload!: unknown;

  @Column({ type: "timestamptz" })
  fetchedAt!: Date;
}
