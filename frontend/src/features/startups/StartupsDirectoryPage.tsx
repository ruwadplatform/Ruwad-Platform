"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { AISummaryButton } from "@/components/ai-summary/AISummaryButton";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { FilterGroup, GuestAdvancedFilterGate } from "@/components/shared/FilterGroup";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { ContactLock } from "@/components/shared/ContactLock";
import { SaveSearchModal } from "@/components/shared/SaveSearchModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";
import { matchSearchTokens } from "@/lib/search";
import { capForGuest } from "@/lib/auth-gate";
import { categoriesFromParams, sameCategory, startupsUrl } from "@/lib/startup-category";
import { regBadgeClass } from "@/lib/widgets";
import { useStartups } from "@/hooks/use-directory-data";
import { HC_CATEGORIES, CITIES, STAGES, STATUSES } from "@/data/reference";
import type { Startup } from "@/types/entities";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";

type ViewMode = "table" | "grid";
type SortKey = "score" | "funding" | "founded" | "name";

interface Filters {
  location: string[];
  category: string[];
  stage: string[];
  status: string[];
  foundedMin: string;
  foundedMax: string;
  fundingMin: string;
  fundingMax: string;
}
const EMPTY_FILTERS: Filters = { location: [], category: [], stage: [], status: [], foundedMin: "", foundedMax: "", fundingMin: "", fundingMax: "" };

const SEARCH_VOCAB = { category: HC_CATEGORIES, location: CITIES, stage: STAGES, status: STATUSES };

function startupTokenMatches(s: Startup, key: string, value: string): boolean {
  if (key === "location") return s.city === value || s.country.includes(value);
  return (s as unknown as Record<string, unknown>)[key] === value;
}

const SORTERS: Record<SortKey, (a: Startup, b: Startup) => number> = {
  // A null score (not yet calculated) sorts last, never to the top.
  score: (a, b) => (b.ruwadScore ?? -Infinity) - (a.ruwadScore ?? -Infinity),
  funding: (a, b) => b.fundingTotal - a.fundingTotal,
  founded: (a, b) => b.founded - a.founded,
  name: (a, b) => a.name.localeCompare(b.name),
};

export function StartupsDirectoryPage() {
  const searchParams = useSearchParams();
  // The URL is the source of truth for the category filter (?category=…; legacy ?cat=… is read too).
  const urlCategories = categoriesFromParams(searchParams);
  const urlKey = urlCategories.join("|");
  const router = useRouter();
  const { loggedIn, hydrated } = useSession();
  const { data: STARTUPS, loading, error } = useStartups();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, category: urlCategories }));
  // Client-side navigation keeps this component mounted, so follow the URL whenever its category changes
  // (Discover → MedTech, → Startups, browser Back/Forward…). Other filters are left alone.
  const [syncedKey, setSyncedKey] = useState(urlKey);
  if (syncedKey !== urlKey) {
    setSyncedKey(urlKey);
    setFilters((f) => ({ ...f, category: urlCategories }));
  }
  /** Category edits (chip ×, filter drawer, clear) are written back to the URL so URL, chip and results always agree. */
  function pushCategories(next: string[]) {
    if (next.join("|") !== urlKey) router.replace(startupsUrl(next), { scroll: false });
  }
  const { openDrawer, closeDrawer } = useFilterDrawer();
  const { openModal } = useModal();

  const filtered = useMemo(() => {
    const { matches, remainder } = matchSearchTokens(search, SEARCH_VOCAB);
    let list = STARTUPS.filter((s) => {
      if (remainder && !s.name.toLowerCase().includes(remainder.toLowerCase())) return false;
      if (matches.some((t) => !startupTokenMatches(s, t.key, t.value))) return false;
      if (filters.category.length && !filters.category.some((c) => sameCategory(c, s.category))) return false;
      if (filters.stage.length && !filters.stage.includes(s.stage)) return false;
      if (filters.status.length && !filters.status.includes(s.status)) return false;
      if (filters.location.length && !filters.location.some((l) => s.city === l || s.country.includes(l))) return false;
      if (filters.foundedMin && s.founded < Number(filters.foundedMin)) return false;
      if (filters.foundedMax && s.founded > Number(filters.foundedMax)) return false;
      if (filters.fundingMin && s.fundingTotal < Number(filters.fundingMin)) return false;
      if (filters.fundingMax && s.fundingTotal > Number(filters.fundingMax)) return false;
      return true;
    });
    list = [...list].sort(SORTERS[sort]);
    return list;
  }, [STARTUPS, search, filters, sort]);

  const { shown, capped } = capForGuest(filtered, 3, !hydrated || !loggedIn);

  function removeFilter(k: keyof Filters, v: string) {
    setFilters((f) => ({ ...f, [k]: (f[k] as string[]).filter((x) => x !== v) }));
    if (k === "category") pushCategories(filters.category.filter((x) => x !== v));
  }

  function openFilters() {
    openDrawer(
      <StartupFilterDrawer
        filters={filters}
        loggedIn={loggedIn}
        onApply={(f) => { setFilters(f); pushCategories(f.category); closeDrawer(); }}
        onClear={() => { setFilters(EMPTY_FILTERS); pushCategories([]); closeDrawer(); }}
        onClose={closeDrawer}
      />,
    );
  }

  function openSaveSearch() {
    if (!requireAuth("save-search", { entityType: "startups" })) return;
    const suggested = filtered.length ? `${filtered.length} results` : "All Startups";
    openModal(
      <SaveSearchModal
        entityType="startups" entityLabel="Startups" suggestedLabel={suggested} count={filtered.length}
        filters={filters as unknown as Record<string, string[]>} search={search}
      />,
    );
  }

  const chips: { k: keyof Filters; v: string }[] = [];
  (["category", "stage", "status", "location"] as const).forEach((k) => filters[k].forEach((v) => chips.push({ k, v })));

  return (
    <div className="startups-page">
      <PageHeader title="Startups" description="Saudi &amp; MENA healthcare, biotech and medtech startups." />
      <div className="toolbar">
        <div className="toolbar-search">
          <RuwadIcon name="search" size={14} />
          <input placeholder="Search startups" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-outline" onClick={openFilters}><RuwadIcon name="filter" size={14} /> Filters</button>
        <button className="btn btn-outline" onClick={openSaveSearch}><RuwadIcon name="bookmark" size={14} /> Save Search</button>
        <select className="select" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="score">Sort: RUWĀD Score</option>
          {loggedIn && <option value="funding">Sort: Funding</option>}
          <option value="founded">Sort: Newest</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
        <div className="seg-tabs">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><RuwadIcon name="rows" size={13} /></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><RuwadIcon name="grid" size={13} /></button>
        </div>
        <AddStartupButton />
      </div>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {chips.map((c) => (
          <span className="chip" key={c.k + c.v}>{c.v}<span className="x" style={{ cursor: "pointer" }} onClick={() => removeFilter(c.k, c.v)}><RuwadIcon name="x" size={11} /></span></span>
        ))}
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading startups…" : `${filtered.length} startup${filtered.length === 1 ? "" : "s"}`}</div>
      <div>
        {error ? (
          <ErrorState title="Couldn&apos;t load startups" body={error} />
        ) : loading ? (
          <LoadingState title="Loading startups…" />
        ) : !STARTUPS.length ? (
          <EmptyState icon="startups" title="No startups available yet" body="Startups added to the RUWĀD ecosystem will appear here." />
        ) : !filtered.length ? (
          <EmptyState icon="search" title="No startups match those filters" body="Try clearing a filter or search term." />
        ) : view === "grid" ? (
          <div className="entity-grid">
            {shown.map((s) => <StartupGridCard key={s.id} s={s} />)}
          </div>
        ) : (
          <StartupTable list={shown} loggedIn={hydrated && loggedIn} />
        )}
        {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Startups" totalCount={STARTUPS.length} />}
      </div>
    </div>
  );
}

function AddStartupButton() {
  const router = useRouter();
  return (
    <button className="btn btn-primary" onClick={() => { if (requireAuth("route", { label: "add" }, "/submit/startup")) router.push("/submit/startup"); }}>
      <RuwadIcon name="plus" size={14} /> Add Startup
    </button>
  );
}

function StartupGridCard({ s }: { s: Startup }) {
  return (
    <EntityCard
      href={`/startups/${s.id}`} logo={s.logo} logoUrl={s.logoUrl} name={s.name} subtitle={`${s.city} · ${s.category}`} desc={s.tagline}
      kind="startups" id={s.id}
      aiSummary={{ type: "startups", id: s.id, name: s.name, logo: s.logo, logoUrl: s.logoUrl, sector: s.category, headquarters: s.city }}
      meta={<><span className={`badge ${regBadgeClass(s.regulatory.sfda)}`}>{s.regulatory.sfda}</span><span className="tag">{s.stage}</span></>}
      foot={<><span className="escore">{s.ruwadScore != null ? s.ruwadScore.toFixed(1) : "—"}</span><span className="small muted">RUWĀD Score</span></>}
    />
  );
}

function StartupTable({ list, loggedIn }: { list: Startup[]; loggedIn: boolean }) {
  return (
    <div className="panel scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            <th></th><th>Company</th><th>Category</th><th>Headquarters</th><th>Stage</th><th>Founded</th>
            <th>Funding</th><th>Employees</th><th>RUWĀD Score</th><th>Last Updated</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => <StartupRow key={s.id} s={s} loggedIn={loggedIn} />)}
        </tbody>
      </table>
    </div>
  );
}

function StartupRow({ s, loggedIn }: { s: Startup; loggedIn: boolean }) {
  const router = useRouter();
  const saved = useIsSaved("startups", s.id);
  const toggleSaved = useToggleSaved();
  return (
    <tr onClick={() => router.push(`/startups/${s.id}`)}>
      <td><OrganizationLogo logo={s.logo} logoUrl={s.logoUrl} className="row-logo" /></td>
      <td><div className="cell-main">{s.name}</div></td>
      <td>{s.category}</td>
      <td>{s.city}</td>
      <td><span className="tag">{s.stage}</span></td>
      <td>{s.founded}</td>
      <td className="mono">{loggedIn ? <>SAR {s.fundingTotal}M</> : <ContactLock />}</td>
      <td className="mono">{s.employees}</td>
      <td className="score">{s.ruwadScore != null ? s.ruwadScore.toFixed(1) : "—"}</td>
      <td className="cell-sub">{s.provenance.lastUpdated}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <div className="row-actions">
          <AISummaryButton entity={{ type: "startups", id: s.id, name: s.name, logo: s.logo, logoUrl: s.logoUrl, sector: s.category, headquarters: s.city }} />
          <button className={`save-star${saved ? " saved" : ""}`} onClick={() => toggleSaved("startups", s.id)}><RuwadIcon name="star" size={16} /></button>
        </div>
      </td>
    </tr>
  );
}

function StartupFilterDrawer({
  filters, loggedIn, onApply, onClear, onClose,
}: { filters: Filters; loggedIn: boolean; onApply: (f: Filters) => void; onClear: () => void; onClose: () => void }) {
  const [local, setLocal] = useState(filters);
  const { hydrated } = useSession();

  function readChecked(key: string): string[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-fk="${key}"]:checked`)).map((i) => i.value);
  }

  function apply() {
    const next: Filters = {
      ...local,
      location: readChecked("location"), category: readChecked("category"), stage: readChecked("stage"), status: readChecked("status"),
    };
    onApply(next);
  }

  return (
    <>
      <div className="filter-drawer-head"><b>Filters</b><button className="icon-btn" onClick={onClose}><RuwadIcon name="x" size={15} /></button></div>
      <div className="filter-drawer-body">
        <FilterGroup label="Location" options={CITIES} dataKey="location" checked={filters.location} inputName="location" />
        <FilterGroup label="Healthcare Category" options={HC_CATEGORIES} dataKey="category" checked={filters.category} inputName="category" />
        <FilterGroup label="Stage" options={STAGES} dataKey="stage" checked={filters.stage} inputName="stage" />
        <FilterGroup label="Company Status" options={STATUSES} dataKey="status" checked={filters.status} inputName="status" />
        {!hydrated ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0" }} aria-hidden="true">
            <span className="skel" style={{ width: "60%" }} />
            <span className="skel" style={{ width: "80%" }} />
          </div>
        ) : !loggedIn ? (
          <GuestAdvancedFilterGate />
        ) : (
          <>
            <details className="filter-group" open>
              <summary>Founded Year<RuwadIcon name="chevron" size={13} /></summary>
              <div className="filter-range mt-8">
                <input className="input" placeholder="Min" defaultValue={local.foundedMin} onChange={(e) => setLocal((f) => ({ ...f, foundedMin: e.target.value }))} />
                <span>–</span>
                <input className="input" placeholder="Max" defaultValue={local.foundedMax} onChange={(e) => setLocal((f) => ({ ...f, foundedMax: e.target.value }))} />
              </div>
            </details>
            <details className="filter-group" open>
              <summary>Funding (SAR M)<RuwadIcon name="chevron" size={13} /></summary>
              <div className="filter-range mt-8">
                <input className="input" placeholder="Min" defaultValue={local.fundingMin} onChange={(e) => setLocal((f) => ({ ...f, fundingMin: e.target.value }))} />
                <span>–</span>
                <input className="input" placeholder="Max" defaultValue={local.fundingMax} onChange={(e) => setLocal((f) => ({ ...f, fundingMax: e.target.value }))} />
              </div>
            </details>
          </>
        )}
      </div>
      <div className="filter-drawer-foot">
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClear}>Clear All</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={apply}>Apply Filters</button>
      </div>
    </>
  );
}
