"use client";

import Link from "next/link";
import { useToast } from "@/components/shell/ToastProvider";
import type { NewsArticle } from "@/types/intelligence";

/** Ported from newsListItem() (js/widgets.js:148-153) — `.news-list-item`
 * with `.nthumb`/`.nmeta`, extended with category/sector tags and related-
 * entity links. No news detail page exists in this phase's spec, so the
 * card surfaces its full summary inline rather than linking anywhere. */
export function NewsCard({ article: n }: { article: NewsArticle }) {
  const toast = useToast();
  return (
    <div className="news-list-item">
      <div className="nthumb" />
      <div style={{ flex: 1 }}>
        <h4>{n.title}</h4>
        <div className="nmeta">{n.publishedDate} · {n.source}</div>
        <p className="small muted mt-4">{n.summary}</p>
        <div className="flex gap-6 mt-8" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <span className="tag">{n.category}</span>
          <span className="tag">{n.sector}</span>
          <span className="tag">{n.geography}</span>
          {n.relatedEntities.map((e) => (
            <Link key={e.id} href={`/${e.type}/${e.id}`} className="chip">{e.name}</Link>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => toast("Opening external source — demo only")}>Source</button>
        </div>
      </div>
    </div>
  );
}
