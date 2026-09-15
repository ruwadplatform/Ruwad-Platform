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
import { useMultinationals } from "@/hooks/use-directory-data";
import { HC_CATEGORIES, COUNTRIES, COMPANY_SIZES } from "@/data/reference";
import type { Multinational } from "@/types/entities";

type ViewMode = "table" | "grid";
const YES_NO = ["Yes", "No"] as const;

interface Filters {
  sector: string[];
  hqCountry: string[];
  saudiPresence: string[];
  menaPresence: string[];
  companySize: string[];
  rdPresence: string[];
  partnershipInterest: string[];
}
const EMPTY_FILTERS: Filters = { sector: [], hqCountry: [], saudiPresence: [], menaPresence: [], companySize: [], rdPresence: [], partnershipInterest: [] };

export function MultinationalsDirectoryPage() {
  const { loggedIn, hydrated } = useSession();
  const { data: MULTINATIONALS, loading, error } = useMultinationals();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { openDrawer, closeDrawer } = useFilterDrawer();
  const { openModal } = useModal();

  const filtered = useMemo(() => {
    return MULTINATIONALS.filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filters.sector.length && !filters.sector.includes(m.category)) return false;
      if (filters.hqCountry.length && !filters.hqCountry.includes(m.country)) return false;
      if (filters.saudiPresence.length && !filters.saudiPresence.includes(m.menaPresence.saudiOffice ? "Yes" : "No")) return false;
      if (filters.menaPresence.length && !filters.menaPresence.includes(m.menaPresence.countriesActiveIn.length > 0 ? "Yes" : "No")) return false;
      if (filters.companySize.length && !filters.companySize.includes(m.companySize)) return false;
      if (filters.rdPresence.length && !filters.rdPresence.includes(m.rdCenters > 0 ? "Yes" : "No")) return false;
      if (filters.partnershipInterest.length && !filters.partnershipInterest.includes(m.partnershipInterest ? "Yes" : "No")) return false;
      return true;
    });
  }, [MULTINATIONALS, search, filters]);

  const { shown, capped } = capForGuest(filtered, 3, !hydrated || !loggedIn);

  function removeFilter(k: keyof Filters, v: string) {
    setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) }));
  }

  function openFilters() {
    openDrawer(
      <MncFilterDrawer
        filters={filters} loggedIn={loggedIn}
        onApply={(f) => { setFilters(f); closeDrawer(); }}
        onClear={() => { setFilters(EMPTY_FILTERS); closeDrawer(); }}
        onClose={closeDrawer}
      />,
    );
  }

  function openSaveSearch() {
    if (!requireAuth("save-search", { entityType: "multinationals" })) return;
    const suggested = filtered.length ? `${filtered.length} results` : "All Multinationals";
    openModal(<SaveSearchModal entityType="multinationals" entityLabel="Multinationals" suggestedLabel={suggested} count={filtered.length} filters={filters as unknown as Record<string, string[]>} search={search} />);
  }

  const chips: { k: keyof Filters; v: string }[] = [];
  (["sector", "hqCountry", "saudiPresence", "menaPresence", "companySize", "rdPresence", "partnershipInterest"] as const).forEach((k) => filters[k].forEach((v) => chips.push({ k, v })));

  return (
    <div className="multinationals-page">
      <div className="page-head"><h2>Multinational Healthcare Companies</h2><p className="muted small">Global pharmaceutical, medical device, diagnostics and digital health companies active in Saudi &amp; MENA.</p></div>
      <div className="toolbar">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search multinationals" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="btn btn-outline" onClick={openFilters}><RuwadIcon name="filter" size={14} /> Filters</button>
        <button className="btn btn-outline" onClick={openSaveSearch}><RuwadIcon name="bookmark" size={14} /> Save Search</button>
        <div className="seg-tabs">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><RuwadIcon name="rows" size={13} /></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><RuwadIcon name="grid" size={13} /></button>
        </div>
        <AddMultinationalButton />
      </div>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {chips.map((c) => (
          <span className="chip" key={c.k + c.v}>{c.v}<span className="x" style={{ cursor: "pointer" }} onClick={() => removeFilter(c.k, c.v)}><RuwadIcon name="x" size={11} /></span></span>
        ))}
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading companies…" : `${filtered.length} compan${filtered.length === 1 ? "y" : "ies"}`}</div>
      <div>
        {error ? (
          <div className="empty-state"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load companies</h4><p>{error}</p></div>
        ) : loading ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>Loading companies…</h4></div>
        ) : !MULTINATIONALS.length ? (
          <div className="empty-state"><RuwadIcon name="corp" size={30} /><h4>No multinational companies available yet</h4><p>Multinationals added to the RUWĀD ecosystem will appear here.</p></div>
        ) : !filtered.length ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>No companies match those filters</h4><p>Try clearing a filter or search term.</p></div>
        ) : view === "grid" ? (
          <div className="entity-grid">{shown.map((m) => <MncGridCard key={m.id} m={m} />)}</div>
        ) : (
          <MncTable list={shown} />
        )}
        {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Multinationals" totalCount={MULTINATIONALS.length} />}
      </div>
    </div>
  );
}

function AddMultinationalButton() {
  const router = useRouter();
  return (
    <button className="btn btn-primary" onClick={() => { if (requireAuth("route", { label: "add" })) router.push("/submit/multinational"); }}>
      <RuwadIcon name="plus" size={14} /> Add Company
    </button>
  );
}

function MncGridCard({ m }: { m: Multinational }) {
  return (
    <EntityCard
      href={`/multinationals/${m.id}`} logo={m.logo} logoUrl={m.logoUrl} logoStyle={{ background: "var(--navy-900)", color: "#fff" }}
      name={m.name} subtitle={`${m.hq} · ${m.category}`} desc={m.tagline} kind="multinationals" id={m.id}
      meta={<><span className="tag">{m.menaPresence.saudiOffice ? "Saudi Presence" : "No Saudi Presence"}</span><span className="tag">{m.products.length} products</span></>}
      foot={<span className="small muted">{m.employees.toLocaleString()} employees</span>}
    />
  );
}

function MncTable({ list }: { list: Multinational[] }) {
  return (
    <div className="panel scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            <th></th><th>Company</th><th>Healthcare Sector</th><th>Headquarters</th><th>MENA Presence</th>
            <th>Saudi Presence</th><th>Employees</th><th>Products</th><th>R&amp;D Presence</th><th>Website</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>{list.map((m) => <MncRow key={m.id} m={m} />)}</tbody>
      </table>
    </div>
  );
}

function MncRow({ m }: { m: Multinational }) {
  const router = useRouter();
  const saved = useIsSaved("multinationals", m.id);
  const toggleSaved = useToggleSaved();
  return (
    <tr onClick={() => router.push(`/multinationals/${m.id}`)}>
      <td><div className="row-logo" style={{ background: "var(--navy-900)", color: "#fff" }}>{m.logo}</div></td>
      <td><div className="cell-main">{m.name}</div><div className="cell-sub">{m.tagline}</div></td>
      <td>{m.category}</td>
      <td>{m.hq}</td>
      <td className="cell-sub">{m.menaPresence.countriesActiveIn.join(", ") || "—"}</td>
      <td><span className={`badge ${m.menaPresence.saudiOffice ? "badge-good" : "badge-neutral"}`}>{m.menaPresence.saudiOffice ? "Yes" : "No"}</span></td>
      <td className="mono">{m.employees.toLocaleString()}</td>
      <td className="mono">{m.products.length}</td>
      <td>{m.rdCenters > 0 ? <span className="tag">{m.rdCenters} centers</span> : "—"}</td>
      <td className="cell-sub">{m.website}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <button className={`save-star${saved ? " saved" : ""}`} onClick={() => toggleSaved("multinationals", m.id)}><RuwadIcon name="star" size={16} /></button>
      </td>
    </tr>
  );
}

function MncFilterDrawer({
  filters, loggedIn, onApply, onClear, onClose,
}: { filters: Filters; loggedIn: boolean; onApply: (f: Filters) => void; onClear: () => void; onClose: () => void }) {
  const { hydrated } = useSession();
  function readChecked(key: string): string[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-fk="${key}"]:checked`)).map((i) => i.value);
  }
  function apply() {
    onApply({
      sector: readChecked("sector"), hqCountry: readChecked("hqCountry"), saudiPresence: readChecked("saudiPresence"),
      menaPresence: readChecked("menaPresence"), companySize: readChecked("companySize"), rdPresence: readChecked("rdPresence"),
      partnershipInterest: readChecked("partnershipInterest"),
    });
  }
  return (
    <>
      <div className="filter-drawer-head"><b>Filters</b><button className="icon-btn" onClick={onClose}><RuwadIcon name="x" size={15} /></button></div>
      <div className="filter-drawer-body">
        <FilterGroup label="Healthcare Sector" options={HC_CATEGORIES} dataKey="sector" checked={filters.sector} inputName="sector" />
        <FilterGroup label="Headquarters Country" options={COUNTRIES} dataKey="hqCountry" checked={filters.hqCountry} inputName="hqCountry" />
        <FilterGroup label="MENA Presence" options={YES_NO} dataKey="menaPresence" checked={filters.menaPresence} inputName="menaPresence" />
        <FilterGroup label="Company Size" options={COMPANY_SIZES} dataKey="companySize" checked={filters.companySize} inputName="companySize" />
        <FilterGroup label="R&D Presence" options={YES_NO} dataKey="rdPresence" checked={filters.rdPresence} inputName="rdPresence" />
        <FilterGroup label="Partnership Interest" options={YES_NO} dataKey="partnershipInterest" checked={filters.partnershipInterest} inputName="partnershipInterest" />
        {!hydrated ? (
          <span className="skel" style={{ width: "60%", display: "block" }} />
        ) : !loggedIn ? (
          <GuestAdvancedFilterGate />
        ) : (
          <FilterGroup label="Saudi Presence" options={YES_NO} dataKey="saudiPresence" checked={filters.saudiPresence} inputName="saudiPresence" />
        )}
      </div>
      <div className="filter-drawer-foot">
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClear}>Clear All</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={apply}>Apply Filters</button>
      </div>
    </>
  );
}
