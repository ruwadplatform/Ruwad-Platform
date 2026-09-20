"use client";

import { useState } from "react";
import Link from "next/link";
import { formatShortDate, safeHttpUrl } from "@/lib/content-format";
import { initialsOf } from "@/components/intelligence/news-initials";
import type { NewsArticle } from "@/types/intelligence";

/** One collected healthcare story. Shows only a short summary; the image,
 * headline and "Read More →" all open the ORIGINAL article in a new tab —
 * RUWĀD never hosts or copies the article itself. */
export function NewsCard({ article: n }: { article: NewsArticle }) {
  const href = safeHttpUrl(n.sourceUrl);
  const image = safeHttpUrl(n.imageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const external = { target: "_blank", rel: "noopener noreferrer" } as const;

  const thumb = image && !imageFailed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="nthumb nthumb-img" src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
    : <div className="nthumb nthumb-ph" aria-hidden="true">{initialsOf(n.source || n.title)}</div>;

  return (
    <div className="news-list-item">
      {href ? <a href={href} {...external} aria-label={`Open article: ${n.title}`} tabIndex={-1}>{thumb}</a> : thumb}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4>{href ? <a href={href} {...external} className="news-title-link">{n.title}</a> : n.title}</h4>
        <div className="nmeta">{[n.publishedDate && formatShortDate(n.publishedDate), n.source].filter(Boolean).join(" · ")}</div>
        {n.summary && <p className="small muted mt-4">{n.summary}</p>}
        <div className="news-actions">
          {n.category && <span className="tag">{n.category}</span>}
          {n.relatedEntities.map((e) => (
            <Link key={e.id} href={`/${e.type}/${e.id}`} className="chip">{e.name}</Link>
          ))}
          {href && <a href={href} {...external} className="btn btn-ghost btn-sm news-read">Read More →</a>}
        </div>
      </div>
    </div>
  );
}
