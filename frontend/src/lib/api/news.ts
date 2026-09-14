import { api } from "./client";
import type { NewsArticle, RelatedEntity } from "@/types/intelligence";

const TYPE_MAP: Record<string, RelatedEntity["type"]> = {
  STARTUP: "startups", INVESTOR: "investors", HUB: "hubs", RESEARCH: "research", MULTINATIONAL: "multinationals",
};

interface RawRelatedEntity { entityType: string; entityId: string; entitySlug?: string; name: string }

interface RawNewsArticle {
  id: string; title: string; source: string; publishedDate: string; category: string; sector: string; geography: string;
  summary: string; sourceUrl: string; relatedEntities?: RawRelatedEntity[];
}

function mapNews(r: RawNewsArticle): NewsArticle {
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    publishedDate: r.publishedDate,
    category: r.category,
    sector: r.sector,
    geography: r.geography,
    summary: r.summary,
    sourceUrl: r.sourceUrl,
    relatedEntities: (r.relatedEntities ?? [])
      .filter((e) => e.entitySlug && TYPE_MAP[e.entityType])
      .map((e) => ({ type: TYPE_MAP[e.entityType], id: e.entitySlug!, name: e.name })),
  };
}

export async function fetchNews(): Promise<NewsArticle[]> {
  const res = await api.get<{ items: RawNewsArticle[] }>("/news?limit=100");
  return res.items.map(mapNews);
}
