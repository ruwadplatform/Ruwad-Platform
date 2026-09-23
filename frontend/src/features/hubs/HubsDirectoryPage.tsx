"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { FilterGroup, GuestAdvancedFilterGate } from "@/components/shared/FilterGroup";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { SaveSearchModal } from "@/components/shared/SaveSearchModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";
import { useSession, useIsSaved, useToggleSaved } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";
import { capForGuest } from "@/lib/auth-gate";
import { useHubs } from "@/hooks/use-directory-data";
import { HUB_TYPES, HC_CATEGORIES, STAGES } from "@/data/reference";
import type { Hub } from "@/types/entities";

type ViewMode = "table" | "grid";

interface Filters {
  type: string[];
  city: string[];
  healthcareFocus: string[];
  stage: string[];
}
const EMPTY_FILTERS: Filters = { type: [], city: [], healthcareFocus: [], stage: [] };

export function HubsDirectoryPage() {
  const { loggedIn, hydrated } = useSession();
  const { data: HUBS, loading, error } = useHubs();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { openDrawer, closeDrawer } = useFilterDrawer();
  const { openModal } = useModal();

  const hubCities = useMemo(() => Array.from(new Set(HUBS.map((h) => h.city))), [HUBS]);

  const filtered = useMemo(() => {
    return HUBS.filter((h) => {
      if (search && !h.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filters.type.length && !filters.type.includes(h.type)) return false;
      if (filters.city.length && !filters.city.includes(h.city)) return false;
      if (filters.healthcareFocus.length && !filters.healthcareFocus.some((f) => h.healthcareFocus.includes(f))) return false;
      if (filters.stage.length && !filters.stage.some((s) => h.stagesSupported.includes(s))) return false;
      return true;
    });
  }, [HUBS, search, filters]);

  const { shown, capped } = capForGuest(filtered, 3, !hydrated || !loggedIn);

  function removeFilter(k: keyof Filters, v: string) {
    setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) }));
  }

  function openFilters() {
    openDrawer(
      <HubFilterDrawer
        filters={filters} loggedIn={loggedIn} hubCities={hubCities}
        onApply={(f) => { setFilters(f); closeDrawer(); }}
        onClear={() => { setFilters(EMPTY_FILTERS); closeDrawer(); }}
        onClose={closeDrawer}
      />,
    );
  }

  function openSaveSearch() {
    if (!requireAuth("save-search", { entityType: "hubs" })) return;
    const suggested = filtered.length ? `${filtered.length} results` : "All Hubs & Enablers";
    openModal(<SaveSearchModal entityType="hubs" entityLabel="Hubs & Enablers" suggestedLabel={suggested} count={filtered.length} filters={filters as unknown as Record<string, string[]>} search={search} />);
  }

  const chips: { k: keyof Filters; v: string }[] = [];
  (["type", "city", "healthcareFocus", "stage"] as const).forEach((k) => filters[k].forEach((v) => chips.push({ k, v })));

  return (
    <div className="hubs-page">
      <div className="page-head"><h2>Hubs &amp; Enablers</h2><p className="muted small">Accelerators, incubators, venture studios and programs supporting Saudi &amp; MENA healthcare startups.</p></div>
      <div className="toolbar">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search hubs &amp; enablers" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="btn btn-outline" onClick={openFilters}><RuwadIcon name="filter" size={14} /> Filters</button>
        <button className="btn btn-outline" onClick={openSaveSearch}><RuwadIcon name="bookmark" size={14} /> Save Search</button>
        <div className="seg-tabs">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><RuwadIcon name="rows" size={13} /></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><RuwadIcon name="grid" size={13} /></button>
        </div>
        <AddHubButton />
      </div>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {chips.map((c) => (
          <span className="chip" key={c.k + c.v}>{c.v}<span className="x" style={{ cursor: "pointer" }} onClick={() => removeFilter(c.k, c.v)}><RuwadIcon name="x" size={11} /></span></span>
        ))}
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading hubs…" : `${filtered.length} hub${filtered.length === 1 ? "" : "s"} & enabler${filtered.length === 1 ? "" : "s"}`}</div>
      <div>
        {error ? (
          <div className="empty-state"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load hubs</h4><p>{error}</p></div>
        ) : loading ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>Loading hubs…</h4></div>
        ) : !HUBS.length ? (
          <div className="empty-state"><RuwadIcon name="hubs" size={30} /><h4>No hubs or ecosystem enablers available yet</h4><p>Hubs added to the RUWĀD ecosystem will appear here.</p></div>
        ) : !filtered.length ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>No hubs match those filters</h4><p>Try clearing a filter or search term.</p></div>
        ) : view === "grid" ? (
          <div className="entity-grid">{shown.map((h) => <HubGridCard key={h.id} h={h} />)}</div>
        ) : (
          <HubTable list={shown} />
        )}
        {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Hubs & Enablers" totalCount={HUBS.length} />}
      </div>
    </div>
  );
}

function AddHubButton() {
  const router = useRouter();
  return (
    <button className="btn btn-primary" onClick={() => { if (requireAuth("route", { label: "add" }, "/submit/hub")) router.push("/submit/hub"); }}>
      <RuwadIcon name="plus" size={14} /> Add Hub
    </button>
  );
}

function HubGridCard({ h }: { h: Hub }) {
  return (
    <EntityCard
      href={`/hubs/${h.id}`} logo={h.logo} logoUrl={h.logoUrl} logoStyle={{ background: "var(--navy-800)", color: "#fff" }}
      name={h.name} subtitle={`${h.city} · ${h.type}`} desc={h.desc} kind="hubs" id={h.id}
      meta={<><span className={`badge ${h.status === "Open" ? "badge-good" : "badge-neutral"}`}>{h.status}</span><span className="tag">{h.programs.length} program{h.programs.length === 1 ? "" : "s"}</span></>}
      foot={<span className="small muted">{h.portfolio.length} companies supported</span>}
    />
  );
}

function HubTable({ list }: { list: Hub[] }) {
  return (
    <div className="panel scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            <th></th><th>Organization</th><th>Type</th><th>Healthcare Focus</th><th>City</th><th>Country</th>
            <th>Programs</th><th>Stage Supported</th><th>Website</th><th>Last Updated</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>{list.map((h) => <HubRow key={h.id} h={h} />)}</tbody>
      </table>
    </div>
  );
}

function HubRow({ h }: { h: Hub }) {
  const router = useRouter();
  const saved = useIsSaved("hubs", h.id);
  const toggleSaved = useToggleSaved();
  return (
    <tr onClick={() => router.push(`/hubs/${h.id}`)}>
      <td><OrganizationLogo logo={h.logo} logoUrl={h.logoUrl} className="row-logo" style={{ background: "var(--navy-800)", color: "#fff" }} /></td>
      <td><div className="cell-main">{h.name}</div><div className="cell-sub">{h.type}</div></td>
      <td>{h.type}</td>
      <td className="cell-sub">{h.healthcareFocus.join(", ")}</td>
      <td>{h.city}</td>
      <td>{h.country}</td>
      <td className="mono">{h.programs.length}</td>
      <td className="cell-sub">{h.stagesSupported.join(", ")}</td>
      <td className="cell-sub">{h.website}</td>
      <td className="cell-sub">{h.provenance.lastUpdated}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <button className={`save-star${saved ? " saved" : ""}`} onClick={() => toggleSaved("hubs", h.id)}><RuwadIcon name="star" size={16} /></button>
      </td>
    </tr>
  );
}

function HubFilterDrawer({
  filters, loggedIn, hubCities, onApply, onClear, onClose,
}: { filters: Filters; loggedIn: boolean; hubCities: string[]; onApply: (f: Filters) => void; onClear: () => void; onClose: () => void }) {
  const { hydrated } = useSession();
  function readChecked(key: string): string[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-fk="${key}"]:checked`)).map((i) => i.value);
  }
  function apply() {
    onApply({ type: readChecked("type"), city: readChecked("city"), healthcareFocus: readChecked("healthcareFocus"), stage: readChecked("stage") });
  }
  return (
    <>
      <div className="filter-drawer-head"><b>Filters</b><button className="icon-btn" onClick={onClose}><RuwadIcon name="x" size={15} /></button></div>
      <div className="filter-drawer-body">
        <FilterGroup label="Organization Type" options={HUB_TYPES} dataKey="type" checked={filters.type} inputName="type" />
        <FilterGroup label="City" options={hubCities} dataKey="city" checked={filters.city} inputName="city" />
        {!hydrated ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0" }} aria-hidden="true">
            <span className="skel" style={{ width: "60%" }} />
            <span className="skel" style={{ width: "80%" }} />
          </div>
        ) : !loggedIn ? (
          <GuestAdvancedFilterGate />
        ) : (
          <>
            <FilterGroup label="Healthcare Focus" options={HC_CATEGORIES} dataKey="healthcareFocus" checked={filters.healthcareFocus} inputName="healthcareFocus" />
            <FilterGroup label="Stage Supported" options={STAGES} dataKey="stage" checked={filters.stage} inputName="stage" />
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
