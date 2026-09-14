"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { FilterGroup, GuestAdvancedFilterGate } from "@/components/shared/FilterGroup";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { SaveSearchModal } from "@/components/shared/SaveSearchModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";
import { capForGuest } from "@/lib/auth-gate";
import { useResearchInstitutions } from "@/hooks/use-directory-data";
import { RESEARCH_INSTITUTION_TYPES, RESEARCH_FIELDS, HC_CATEGORIES, COUNTRIES } from "@/data/reference";
import type { ResearchInstitution } from "@/types/entities";

type ViewMode = "table" | "grid";

interface Filters {
  type: string[];
  country: string[];
  city: string[];
  healthcareFocus: string[];
  researchArea: string[];
  collaboration: string[];
}
const EMPTY_FILTERS: Filters = { type: [], country: [], city: [], healthcareFocus: [], researchArea: [], collaboration: [] };
const COLLAB_STATUSES = ["Open", "Selective", "Closed"] as const;

export function ResearchDirectoryPage() {
  const { loggedIn } = useSession();
  const { data: RESEARCH_INSTITUTIONS, loading, error } = useResearchInstitutions();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { openDrawer, closeDrawer } = useFilterDrawer();
  const { openModal } = useModal();

  const researchCities = useMemo(() => Array.from(new Set(RESEARCH_INSTITUTIONS.map((r) => r.city))), [RESEARCH_INSTITUTIONS]);

  const filtered = useMemo(() => {
    return RESEARCH_INSTITUTIONS.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filters.type.length && !filters.type.includes(r.type)) return false;
      if (filters.country.length && !filters.country.includes(r.country)) return false;
      if (filters.city.length && !filters.city.includes(r.city)) return false;
      if (filters.healthcareFocus.length && !filters.healthcareFocus.some((f) => r.healthcareFocus.includes(f))) return false;
      if (filters.researchArea.length && !filters.researchArea.some((f) => r.coreResearchAreas.includes(f))) return false;
      if (filters.collaboration.length && !filters.collaboration.includes(r.collaborationStatus)) return false;
      return true;
    });
  }, [RESEARCH_INSTITUTIONS, search, filters]);

  const { shown, capped } = capForGuest(filtered, 3, !loggedIn);

  function removeFilter(k: keyof Filters, v: string) {
    setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) }));
  }

  function openFilters() {
    openDrawer(
      <ResearchFilterDrawer
        filters={filters} loggedIn={loggedIn} researchCities={researchCities}
        onApply={(f) => { setFilters(f); closeDrawer(); }}
        onClear={() => { setFilters(EMPTY_FILTERS); closeDrawer(); }}
        onClose={closeDrawer}
      />,
    );
  }

  function openSaveSearch() {
    if (!requireAuth("save-search", { entityType: "research" })) return;
    const suggested = filtered.length ? `${filtered.length} results` : "All Research & Academia";
    openModal(<SaveSearchModal entityType="research" entityLabel="Research & Academia" suggestedLabel={suggested} count={filtered.length} filters={filters as unknown as Record<string, string[]>} search={search} />);
  }

  const chips: { k: keyof Filters; v: string }[] = [];
  (["type", "country", "city", "healthcareFocus", "researchArea", "collaboration"] as const).forEach((k) => filters[k].forEach((v) => chips.push({ k, v })));

  return (
    <div className="research-directory-page">
      <div className="page-head"><h2>Research &amp; Academia</h2><p className="muted small">Universities, research institutions and academic healthcare centers across Saudi Arabia &amp; the region.</p></div>
      <div className="toolbar">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search institutions" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="btn btn-outline" onClick={openFilters}><RuwadIcon name="filter" size={14} /> Filters</button>
        <button className="btn btn-outline" onClick={openSaveSearch}><RuwadIcon name="bookmark" size={14} /> Save Search</button>
        <div className="seg-tabs">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><RuwadIcon name="rows" size={13} /></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><RuwadIcon name="grid" size={13} /></button>
        </div>
        <AddResearchButton />
      </div>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {chips.map((c) => (
          <span className="chip" key={c.k + c.v}>{c.v}<span className="x" style={{ cursor: "pointer" }} onClick={() => removeFilter(c.k, c.v)}><RuwadIcon name="x" size={11} /></span></span>
        ))}
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading institutions…" : `${filtered.length} institution${filtered.length === 1 ? "" : "s"}`}</div>
      <div>
        {error ? (
          <div className="empty-state"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load institutions</h4><p>{error}</p></div>
        ) : loading ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>Loading institutions…</h4></div>
        ) : !filtered.length ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>No institutions match those filters</h4><p>Try clearing a filter or search term.</p></div>
        ) : view === "grid" ? (
          <div className="entity-grid">{shown.map((r) => <ResearchGridCard key={r.id} r={r} />)}</div>
        ) : (
          <ResearchTable list={shown} />
        )}
        {capped && <DirectoryGateBanner entityLabelPlural="Research Institutions" totalCount={RESEARCH_INSTITUTIONS.length} />}
      </div>
    </div>
  );
}

function AddResearchButton() {
  const router = useRouter();
  return (
    <button className="btn btn-primary" onClick={() => { if (requireAuth("route", { label: "add" })) router.push("/submit/research"); }}>
      <RuwadIcon name="plus" size={14} /> Add Institution
    </button>
  );
}

function ResearchGridCard({ r }: { r: ResearchInstitution }) {
  return (
    <EntityCard
      href={`/research/${r.id}`} logo={r.logo} logoUrl={r.logoUrl} logoStyle={{ background: "var(--navy-700)", color: "#fff" }}
      name={r.name} subtitle={`${r.city} · ${r.type}`} desc={r.about} kind="research" id={r.id}
      meta={<><span className="tag">{r.coreResearchAreas[0]}</span><span className="tag">{r.publications.length} publications</span></>}
      foot={<span className="small muted">{r.numResearchers} researchers</span>}
    />
  );
}

function ResearchTable({ list }: { list: ResearchInstitution[] }) {
  return (
    <div className="panel scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            <th></th><th>Institution</th><th>Type</th><th>Primary Research Area</th><th>Healthcare Focus</th>
            <th>City</th><th>Country</th><th>Active Projects</th><th>Publications</th><th>Collaboration Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>{list.map((r) => <ResearchRow key={r.id} r={r} />)}</tbody>
      </table>
    </div>
  );
}

function ResearchRow({ r }: { r: ResearchInstitution }) {
  const router = useRouter();
  const saved = useIsSaved("research", r.id);
  const toggleSaved = useToggleSaved();
  return (
    <tr onClick={() => router.push(`/research/${r.id}`)}>
      <td><div className="row-logo" style={{ background: "var(--navy-700)", color: "#fff" }}>{r.logo}</div></td>
      <td><div className="cell-main">{r.name}</div><div className="cell-sub">Est. {r.founded}</div></td>
      <td>{r.type}</td>
      <td className="cell-sub">{r.coreResearchAreas[0]}</td>
      <td className="cell-sub">{r.healthcareFocus.join(", ")}</td>
      <td>{r.city}</td>
      <td>{r.country}</td>
      <td className="mono">{r.activeProjects.length}</td>
      <td className="mono">{r.publications.length}</td>
      <td><span className={`badge ${r.collaborationStatus === "Open" ? "badge-good" : r.collaborationStatus === "Selective" ? "badge-warn" : "badge-neutral"}`}>{r.collaborationStatus}</span></td>
      <td onClick={(e) => e.stopPropagation()}>
        <button className={`save-star${saved ? " saved" : ""}`} onClick={() => toggleSaved("research", r.id)}><RuwadIcon name="star" size={16} /></button>
      </td>
    </tr>
  );
}

function ResearchFilterDrawer({
  filters, loggedIn, researchCities, onApply, onClear, onClose,
}: { filters: Filters; loggedIn: boolean; researchCities: string[]; onApply: (f: Filters) => void; onClear: () => void; onClose: () => void }) {
  function readChecked(key: string): string[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-fk="${key}"]:checked`)).map((i) => i.value);
  }
  function apply() {
    onApply({
      type: readChecked("type"), country: readChecked("country"), city: readChecked("city"),
      healthcareFocus: readChecked("healthcareFocus"), researchArea: readChecked("researchArea"), collaboration: readChecked("collaboration"),
    });
  }
  return (
    <>
      <div className="filter-drawer-head"><b>Filters</b><button className="icon-btn" onClick={onClose}><RuwadIcon name="x" size={15} /></button></div>
      <div className="filter-drawer-body">
        <FilterGroup label="Institution Type" options={RESEARCH_INSTITUTION_TYPES} dataKey="type" checked={filters.type} inputName="type" />
        <FilterGroup label="Healthcare Sector" options={HC_CATEGORIES} dataKey="healthcareFocus" checked={filters.healthcareFocus} inputName="healthcareFocus" />
        <FilterGroup label="Country" options={COUNTRIES} dataKey="country" checked={filters.country} inputName="country" />
        <FilterGroup label="City" options={researchCities} dataKey="city" checked={filters.city} inputName="city" />
        <FilterGroup label="Collaboration Availability" options={COLLAB_STATUSES} dataKey="collaboration" checked={filters.collaboration} inputName="collaboration" />
        {!loggedIn ? <GuestAdvancedFilterGate /> : <FilterGroup label="Research Field" options={RESEARCH_FIELDS} dataKey="researchArea" checked={filters.researchArea} inputName="researchArea" />}
      </div>
      <div className="filter-drawer-foot">
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClear}>Clear All</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={apply}>Apply Filters</button>
      </div>
    </>
  );
}
