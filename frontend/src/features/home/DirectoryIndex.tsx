import Link from "next/link";
import type { IndexItem } from "@/lib/seo/data";
import type { ProfileSection } from "@/lib/seo/routes";

/** A plain, server-rendered list of every public profile in a directory, under the interactive directory. The interactive list loads in the browser after sign-in checks, so without
 * this a search engine would see an empty page; with it, every profile is one ordinary link away. */
export function DirectoryIndex({ section, heading, intro, items }: { section: ProfileSection; heading: string; intro: string; items: IndexItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="dir-index" aria-labelledby={`dir-index-${section}`}>
      <h2 id={`dir-index-${section}`}>{heading}</h2>
      <p>{intro}</p>
      <ul>
        {items.map((i) => (
          <li key={i.slug}>
            <Link href={`/${section}/${encodeURIComponent(i.slug)}`}>{i.name}</Link>
            {i.note && <span className="muted small"> {i.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
