"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { FilterGroup } from "@/components/shared/FilterGroup";
import { EmptyState } from "@/components/shared/EmptyState";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";
import { useStartups, useInvestors, useMultinationals } from "@/hooks/use-directory-data";
import { HC_CATEGORIES, CITIES, STAGES } from "@/data/reference";
import type { Startup, Investor, Multinational } from "@/types/entities";

type EntityType = "Startup" | "Multinational" | "Investor";
interface ScreenerRow {
  type: EntityType;
  name: string;
  sub: string;
  category: string;
  city: string;
  stageList: string[];
  route: string;
  metricLabel: string;
  metric: number;
}

function screenerRows(types: Record<EntityType, boolean>, STARTUPS: Startup[], INVESTORS: Investor[], MULTINATIONALS: Multinational[]): ScreenerRow[] {
  const rows: ScreenerRow[] = [];
  if (types.Startup) STARTUPS.forEach((s) => rows.push({ type: "Startup", name: s.name, sub: s.tagline, category: s.category, city: s.city, stageList: [s.stage], route: `/startups/${s.id}`, metricLabel: "RUWĀD Score", metric: s.score }));
  if (types.Multinational) MULTINATIONALS.forEach((m) => rows.push({ type: "Multinational", name: m.name, sub: m.tagline, category: m.category, city: m.city, stageList: [], route: `/multinationals/${m.id}`, metricLabel: "R&D Centers", metric: m.rdCenters }));
  if (types.Investor) INVESTORS.forEach((v) => rows.push({ type: "Investor", name: v.name, sub: v.type, category: v.hcFocus.join(", "), city: v.city, stageList: v.stageFocus, route: `/investors/${v.id}`, metricLabel: "Deals", metric: v.investments }));
  return rows;
}

interface Filters { category: string[]; location: string[]; stage: string[] }
const EMPTY_FILTERS: Filters = { category: [], location: [], stage: [] };

/** Ported from renderScreener() (js/screener.js) — a single query surface
 * spanning Startups, Multinationals and Investors, reusing the same
 * filter-drawer/FilterGroup pattern the directory pages already use. */
export function ScreenerPage() {
  const router = useRouter();
  const { openDrawer, closeDrawer } = useFilterDrawer();
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();
  const { data: MULTINATIONALS } = useMultinationals();
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<Record<EntityType, boolean>>({ Startup: true, Multinational: true, Investor: true });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const rows = useMemo(() => {
    let list = screenerRows(types, STARTUPS, INVESTORS, MULTINATIONALS);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (filters.category.length) list = list.filter((r) => filters.category.some((c) => r.category.includes(c)));
    if (filters.location.length) list = list.filter((r) => filters.location.includes(r.city));
    if (filters.stage.length) list = list.filter((r) => filters.stage.some((st) => r.stageList.includes(st)));
    return list.sort((a, b) => b.metric - a.metric);
  }, [STARTUPS, INVESTORS, MULTINATIONALS, types, query, filters]);

  const activeTypeCount = Object.values(types).filter(Boolean).length;

  function toggleType(t: EntityType) {
    setTypes((prev) => ({ ...prev, [t]: !prev[t] }));
  }

  function openFilters() {
    openDrawer(<ScreenerFilterDrawer filters={filters} onApply={(f) => { setFilters(f); closeDrawer(); }} onClear={() => { setFilters(EMPTY_FILTERS); closeDrawer(); }} onClose={closeDrawer} />);
  }

  const chips: { k: keyof Filters; v: string }[] = [];
  (["category", "location", "stage"] as const).forEach((k) => filters[k].forEach((v) => chips.push({ k, v })));

  return (
    <div className="screener-page">
      <div className="page-head"><h2>Screener</h2><p className="muted small">Search and filter startups, multinationals and investors together — one query across the whole ecosystem.</p></div>
      <div className="toolbar">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <button className="btn btn-outline" onClick={openFilters}><RuwadIcon name="filter" size={14} /> Filters</button>
      </div>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {(["Startup", "Multinational", "Investor"] as const).map((t) => (
          <span key={t} className={`chip-filter${types[t] ? " active" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggleType(t)}>{t}s</span>
        ))}
      </div>
      {chips.length > 0 && (
        <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
          {chips.map((c) => (
            <span className="chip" key={c.k + c.v}>{c.v}<span className="x" style={{ cursor: "pointer" }} onClick={() => setFilters((f) => ({ ...f, [c.k]: f[c.k].filter((x) => x !== c.v) }))}><RuwadIcon name="x" size={11} /></span></span>
          ))}
        </div>
      )}
      <div className="result-count small muted mb-12">{rows.length} result{rows.length === 1 ? "" : "s"} across {activeTypeCount} entity type{activeTypeCount === 1 ? "" : "s"}</div>
      {!rows.length ? (
        <EmptyState icon="search" title="No results" body="Try widening your filters or entity types." />
      ) : (
        <div className="panel scroll-x">
          <table className="data-table">
            <thead><tr><th>Type</th><th>Name</th><th>Category / Focus</th><th>Location</th><th>Stage</th><th>Metric</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type + r.route} style={{ cursor: "pointer" }} onClick={() => router.push(r.route)}>
                  <td><span className="tag">{r.type}</span></td>
                  <td><div className="cell-main">{r.name}</div><div className="cell-sub">{r.sub}</div></td>
                  <td>{r.category || "—"}</td>
                  <td>{r.city}</td>
                  <td>{r.stageList.join(", ") || "—"}</td>
                  <td className="mono">{r.metric} <span className="cell-sub">{r.metricLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScreenerFilterDrawer({ filters, onApply, onClear, onClose }: { filters: Filters; onApply: (f: Filters) => void; onClear: () => void; onClose: () => void }) {
  function readChecked(key: string): string[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-fk="${key}"]:checked`)).map((i) => i.value);
  }
  function apply() {
    onApply({ category: readChecked("category"), location: readChecked("location"), stage: readChecked("stage") });
  }
  return (
    <>
      <div className="filter-drawer-head"><b>Filters</b><button className="icon-btn" onClick={onClose}><RuwadIcon name="x" size={15} /></button></div>
      <div className="filter-drawer-body">
        <FilterGroup label="Healthcare Category" options={HC_CATEGORIES} dataKey="category" checked={filters.category} inputName="category" />
        <FilterGroup label="Location" options={CITIES} dataKey="location" checked={filters.location} inputName="location" />
        <FilterGroup label="Stage Focus" options={STAGES} dataKey="stage" checked={filters.stage} inputName="stage" />
      </div>
      <div className="filter-drawer-foot">
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClear}>Clear All</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={apply}>Apply Filters</button>
      </div>
    </>
  );
}
