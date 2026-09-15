"use client";

import { useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useSession, useWatchlist, useToggleSaved } from "@/hooks/use-store";
import { useResolveCollections } from "@/hooks/use-directory-data";
import { resolveEntity, RESOLVABLE_KINDS, KIND_LABELS, KIND_LOGO_STYLE, type ResolvableKind } from "@/lib/entity-resolve";

type Group = "All" | ResolvableKind;

export function WatchlistPage() {
  const { loggedIn, hydrated } = useSession();
  const watchlist = useWatchlist();
  const toggleSaved = useToggleSaved();
  const collections = useResolveCollections();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<Group>("All");
  const [sort, setSort] = useState<"name" | "type">("name");

  const entities = useMemo(() => {
    const kinds = group === "All" ? RESOLVABLE_KINDS : [group];
    const refs: { kind: ResolvableKind; id: string }[] = [];
    kinds.forEach((k) => (watchlist[k] ?? []).forEach((id) => refs.push({ kind: k, id })));
    let list = refs.map(({ kind, id }) => resolveEntity(kind, id, collections)).filter((e): e is NonNullable<typeof e> => !!e);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.sector.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));
    return list;
  }, [watchlist, group, search, sort, collections]);

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  const totalCount = RESOLVABLE_KINDS.reduce((a, k) => a + (watchlist[k]?.length ?? 0), 0);

  return (
    <div>
      <IntelligencePageHeader title="Watchlist" description="Startups, investors, hubs, research institutions and multinationals you're tracking." />

      <div className="toolbar mt-20 mb-16">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search watchlist" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as "name" | "type")} style={{ maxWidth: 180 }}>
          <option value="name">Sort: Name (A–Z)</option>
          <option value="type">Sort: Entity Type</option>
        </select>
      </div>

      <div className="chip-select mb-20">
        <button className={group === "All" ? "active" : ""} onClick={() => setGroup("All")}>All ({totalCount})</button>
        {RESOLVABLE_KINDS.map((k) => (
          <button key={k} className={group === k ? "active" : ""} onClick={() => setGroup(k)}>{KIND_LABELS[k]} ({watchlist[k]?.length ?? 0})</button>
        ))}
      </div>

      {!totalCount ? (
        <EmptyState icon="star" title="You haven't added anything to your watchlist yet." body="Save startups, investors, hubs, research institutions or multinationals from any directory to track them here." />
      ) : !entities.length ? (
        <EmptyState icon="search" title="No watchlist items match that filter" body="Try a different search term or entity type." />
      ) : (
        <div className="entity-grid">
          {entities.map((e) => (
            <div key={`${e.kind}-${e.id}`} style={{ position: "relative" }}>
              <EntityCard href={e.href} logo={e.logo} logoUrl={e.logoUrl} logoStyle={KIND_LOGO_STYLE[e.kind]} name={e.name} subtitle={e.subtitle} desc={e.desc} kind={e.kind} id={e.id}
                meta={<span className="tag">{e.sector}</span>}
                foot={<span className="small muted">{KIND_LABELS[e.kind]}</span>} />
              <button
                className="btn btn-outline btn-sm mt-8"
                style={{ width: "100%" }}
                onClick={(ev) => { ev.preventDefault(); toggleSaved(e.kind, e.id); }}
              >
                <RuwadIcon name="x" size={12} /> Remove from Watchlist
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
