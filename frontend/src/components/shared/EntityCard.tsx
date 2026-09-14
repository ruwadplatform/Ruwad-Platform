"use client";

import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useIsSaved, useToggleSaved } from "@/hooks/use-store";
import type { WatchlistKind } from "@/lib/store";
import type { ReactNode } from "react";

/** Ported verbatim from entityCardStartup()/entityCardInvestor()
 * (js/widgets.js:99-122) — identical .entity-card/.entity-card-top/.elogo/
 * .etitle/.edesc/.emeta/.entity-card-foot markup in both cases; only the
 * meta-row and footer content differ per entity type (badge+tag+score vs
 * tag+tag+portfolio-count), so those two slots are the only parameterized
 * parts — not force-abstracted beyond what's already byte-identical. */
export function EntityCard({
  href, logo, logoUrl, logoStyle, name, subtitle, desc, meta, foot, kind, id,
}: {
  href: string;
  logo: string;
  /** A real uploaded logo image, when the entity has one — takes priority
   * over the colored-initials `logo` fallback. */
  logoUrl?: string | null;
  logoStyle?: React.CSSProperties;
  name: string;
  subtitle: string;
  desc: string;
  meta: ReactNode;
  foot: ReactNode;
  kind: WatchlistKind;
  id: string;
}) {
  const saved = useIsSaved(kind, id);
  const toggleSaved = useToggleSaved();

  return (
    <Link href={href} className="entity-card">
      <div className="entity-card-top">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="elogo avatar-sq" style={{ width: 38, height: 38, objectFit: "contain", background: "#fff", ...logoStyle }} />
        ) : (
          <div className="elogo avatar avatar-sq" style={{ width: 38, height: 38, ...logoStyle }}>{logo}</div>
        )}
        <div className="etitle"><b>{name}</b><span>{subtitle}</span></div>
        <button
          className={`save-star${saved ? " saved" : ""}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSaved(kind, id); }}
        >
          <RuwadIcon name="star" size={15} />
        </button>
      </div>
      <div className="edesc">{desc}</div>
      <div className="emeta">{meta}</div>
      <div className="entity-card-foot">{foot}</div>
    </Link>
  );
}
