import type { CSSProperties } from "react";
import type { WatchlistKind } from "@/lib/store";
import type { Startup, Investor, Hub, ResearchInstitution, Multinational } from "@/types/entities";

/** Resolves a watchlist/listing reference (kind + id) against the existing
 * entity datasets — used so Workspace pages never duplicate full entity
 * records, only ids. Returns a normalized shape for the pieces every
 * EntityCard/table row needs in common; kind-specific fields (meta/foot
 * content) are read directly off the resolved record by the caller. */
export type ResolvableKind = Extract<WatchlistKind, "startups" | "investors" | "hubs" | "research" | "multinationals">;

export interface ResolvedEntity {
  kind: ResolvableKind;
  id: string;
  href: string;
  logo: string;
  logoUrl?: string | null;
  name: string;
  subtitle: string;
  desc: string;
  sector: string;
  record: unknown;
}

export interface ResolveCollections {
  startups: Startup[];
  investors: Investor[];
  hubs: Hub[];
  research: ResearchInstitution[];
  multinationals: Multinational[];
}

/** Callers fetch the five collections once (via useStartups()/useInvestors()/
 * etc, already shared-cached) and pass them in — this stays a plain
 * function, not a hook, so it can be called from inside a .map() over a
 * list of watchlist/listing refs without violating rules-of-hooks. */
export function resolveEntity(kind: ResolvableKind, id: string, collections: ResolveCollections): ResolvedEntity | null {
  switch (kind) {
    case "startups": {
      const s = collections.startups.find((x) => x.id === id);
      if (!s) return null;
      return { kind, id, href: `/startups/${s.id}`, logo: s.logo, logoUrl: s.logoUrl, name: s.name, subtitle: `${s.city} · ${s.category}`, desc: s.tagline, sector: s.category, record: s };
    }
    case "investors": {
      const v = collections.investors.find((x) => x.id === id);
      if (!v) return null;
      return { kind, id, href: `/investors/${v.id}`, logo: v.logo, logoUrl: v.logoUrl, name: v.name, subtitle: `${v.city} · ${v.type}`, desc: v.desc, sector: v.hcFocus[0] ?? v.type, record: v };
    }
    case "hubs": {
      const h = collections.hubs.find((x) => x.id === id);
      if (!h) return null;
      return { kind, id, href: `/hubs/${h.id}`, logo: h.logo, logoUrl: h.logoUrl, name: h.name, subtitle: `${h.city} · ${h.type}`, desc: h.desc, sector: h.healthcareFocus[0] ?? h.type, record: h };
    }
    case "research": {
      const r = collections.research.find((x) => x.id === id);
      if (!r) return null;
      return { kind, id, href: `/research/${r.id}`, logo: r.logo, logoUrl: r.logoUrl, name: r.name, subtitle: `${r.city} · ${r.type}`, desc: r.about, sector: r.coreResearchAreas[0] ?? r.type, record: r };
    }
    case "multinationals": {
      const m = collections.multinationals.find((x) => x.id === id);
      if (!m) return null;
      return { kind, id, href: `/multinationals/${m.id}`, logo: m.logo, logoUrl: m.logoUrl, name: m.name, subtitle: `${m.hq} · ${m.category}`, desc: m.tagline, sector: m.category, record: m };
    }
    default:
      return null;
  }
}

export const RESOLVABLE_KINDS: ResolvableKind[] = ["startups", "investors", "hubs", "research", "multinationals"];
export const KIND_LABELS: Record<ResolvableKind, string> = {
  startups: "Startups", investors: "Investors", hubs: "Hubs & Enablers", research: "Research & Academia", multinationals: "Multinationals",
};
export const KIND_LOGO_STYLE: Record<ResolvableKind, CSSProperties> = {
  startups: {}, investors: { background: "var(--navy-900)", color: "#fff" }, hubs: { background: "var(--navy-800)", color: "#fff" },
  research: { background: "var(--navy-700)", color: "#fff" }, multinationals: { background: "var(--navy-900)", color: "#fff" },
};
