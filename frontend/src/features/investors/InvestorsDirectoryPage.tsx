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
import { matchSearchTokens } from "@/lib/search";
import { capForGuest } from "@/lib/auth-gate";
import { useInvestors } from "@/hooks/use-directory-data";
import { HC_CATEGORIES, STAGES, INVESTOR_TYPES } from "@/data/reference";
import type { Investor } from "@/types/entities";

type ViewMode = "table" | "grid";

interface Filters {
  type: string[];
  location: string[];
  focus: string[];
  stage: string[];
}
const EMPTY_FILTERS: Filters = { type: [], location: [], focus: [], stage: [] };

function investorTokenMatches(v: Investor, key: string, value: string): boolean {
  if (key === "type") return v.type === value;
  if (key === "location") return v.city === value;
  if (key === "focus") return v.hcFocus.includes(value);
  if (key === "stage") return v.stageFocus.includes(value);
  return false;
}

export function InvestorsDirectoryPage() {
  const { loggedIn, hydrated } = useSession();
  const { data: INVESTORS, loading, error } = useInvestors();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { openDrawer, closeDrawer } = useFilterDrawer();
  const { openModal } = useModal();

  const investorCities = useMemo(() => Array.from(new Set(INVESTORS.map((v) => v.city))), [INVESTORS]);
  const searchVocab = useMemo(() => ({ type: INVESTOR_TYPES, location: investorCities, focus: HC_CATEGORIES, stage: STAGES }), [investorCities]);

  const filtered = useMemo(() => {
    const { matches, remainder } = matchSearchTokens(search, searchVocab);
    return INVESTORS.filter((v) => {
      if (remainder && !v.name.toLowerCase().includes(remainder.toLowerCase())) return false;
      if (matches.some((t) => !investorTokenMatches(v, t.key, t.value))) return false;
      if (filters.type.length && !filters.type.includes(v.type)) return false;
      if (filters.location.length && !filters.location.includes(v.city)) return false;
      if (filters.stage.length && !filters.stage.some((s) => v.stageFocus.includes(s))) return false;
      if (filters.focus.length && !filters.focus.some((f) => v.hcFocus.includes(f))) return false;
      return true;
    });
  }, [INVESTORS, search, filters, searchVocab]);

  const { shown, capped } = capForGuest(filtered, 3, !hydrated || !loggedIn);

  function removeFilter(k: keyof Filters, v: string) {
    setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) }));
  }

  function openFilters() {
    openDrawer(
      <InvestorFilterDrawer
        filters={filters} loggedIn={loggedIn} investorCities={investorCities}
        onApply={(f) => { setFilters(f); closeDrawer(); }}
        onClear={() => { setFilters(EMPTY_FILTERS); closeDrawer(); }}
        onClose={closeDrawer}
      />,
    );
  }

  function openSaveSearch() {
    if (!requireAuth("save-search", { entityType: "investors" })) return;
    const suggested = filtered.length ? `${filtered.length} results` : "All Investors";
    openModal(<SaveSearchModal entityType="investors" entityLabel="Investors" suggestedLabel={suggested} count={filtered.length} filters={filters as unknown as Record<string, string[]>} search={search} />);
  }

  const chips: { k: keyof Filters; v: string }[] = [];
  (["type", "location", "focus", "stage"] as const).forEach((k) => filters[k].forEach((v) => chips.push({ k, v })));

  return (
    <div className="investors-page">
      <div className="page-head"><h2>Investors</h2><p className="muted small">VCs, corporate venture arms, sovereign vehicles and angel networks active in Saudi healthcare.</p></div>
      <div className="toolbar">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search investors" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="btn btn-outline" onClick={openFilters}><RuwadIcon name="filter" size={14} /> Filters</button>
        <button className="btn btn-outline" onClick={openSaveSearch}><RuwadIcon name="bookmark" size={14} /> Save Search</button>
        <div className="seg-tabs">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><RuwadIcon name="rows" size={13} /></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><RuwadIcon name="grid" size={13} /></button>
        </div>
        <AddInvestorButton />
      </div>
      <div className="flex gap-8 mb-16" style={{ flexWrap: "wrap" }}>
        {chips.map((c) => (
          <span className="chip" key={c.k + c.v}>{c.v}<span className="x" style={{ cursor: "pointer" }} onClick={() => removeFilter(c.k, c.v)}><RuwadIcon name="x" size={11} /></span></span>
        ))}
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading investors…" : `${filtered.length} investor${filtered.length === 1 ? "" : "s"}`}</div>
      <div>
        {error ? (
          <div className="empty-state"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load investors</h4><p>{error}</p></div>
        ) : loading ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>Loading investors…</h4></div>
        ) : !INVESTORS.length ? (
          <div className="empty-state"><RuwadIcon name="investors" size={30} /><h4>No investors available yet</h4><p>Investors added to the RUWĀD ecosystem will appear here.</p></div>
        ) : !filtered.length ? (
          <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>No investors match those filters</h4><p>Try clearing a filter or search term.</p></div>
        ) : view === "grid" ? (
          <div className="entity-grid">{shown.map((v) => <InvestorGridCard key={v.id} v={v} />)}</div>
        ) : (
          <InvestorTable list={shown} />
        )}
        {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Investors" totalCount={INVESTORS.length} />}
      </div>
    </div>
  );
}

function AddInvestorButton() {
  const router = useRouter();
  return (
    <button className="btn btn-primary" onClick={() => { if (requireAuth("route", { label: "add" })) router.push("/submit/investor"); }}>
      <RuwadIcon name="plus" size={14} /> Add Investor
    </button>
  );
}

function InvestorGridCard({ v }: { v: Investor }) {
  return (
    <EntityCard
      href={`/investors/${v.id}`} logo={v.logo} logoUrl={v.logoUrl} logoStyle={{ background: "var(--navy-900)", color: "#fff" }}
      name={v.name} subtitle={`${v.city} · ${v.type}`} desc={v.desc} kind="investors" id={v.id}
      meta={<><span className="tag">{v.ticket}</span><span className="tag">{v.hcFocus.length} focus areas</span></>}
      foot={<span className="small muted">{v.portfolio.length} in portfolio</span>}
    />
  );
}

function InvestorTable({ list }: { list: Investor[] }) {
  return (
    <div className="panel scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            <th></th><th>Investor</th><th>Type</th><th>Headquarters</th><th>Stage Focus</th><th>Healthcare Focus</th>
            <th>Typical Ticket</th><th>Portfolio Size</th><th>Recent Deals</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>{list.map((v) => <InvestorRow key={v.id} v={v} />)}</tbody>
      </table>
    </div>
  );
}

function InvestorRow({ v }: { v: Investor }) {
  const router = useRouter();
  const saved = useIsSaved("investors", v.id);
  const toggleSaved = useToggleSaved();
  return (
    <tr onClick={() => router.push(`/investors/${v.id}`)}>
      <td><div className="row-logo" style={{ background: "var(--navy-900)", color: "#fff" }}>{v.logo}</div></td>
      <td><div className="cell-main">{v.name}</div><div className="cell-sub">{v.founded ? `Est. ${v.founded}` : "—"}</div></td>
      <td>{v.type}</td>
      <td>{v.city}</td>
      <td className="cell-sub">{v.stageFocus.join(", ")}</td>
      <td className="cell-sub">{v.hcFocus.join(", ")}</td>
      <td className="mono">{v.ticket}</td>
      <td className="mono">{v.portfolio.length}</td>
      <td className="cell-sub">{v.recentDeals[0]?.startup || "—"}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <button className={`save-star${saved ? " saved" : ""}`} onClick={() => toggleSaved("investors", v.id)}><RuwadIcon name="star" size={16} /></button>
      </td>
    </tr>
  );
}

function InvestorFilterDrawer({
  filters, loggedIn, investorCities, onApply, onClear, onClose,
}: { filters: Filters; loggedIn: boolean; investorCities: string[]; onApply: (f: Filters) => void; onClear: () => void; onClose: () => void }) {
  const { hydrated } = useSession();
  function readChecked(key: string): string[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-fk="${key}"]:checked`)).map((i) => i.value);
  }
  function apply() {
    onApply({ type: readChecked("type"), location: readChecked("location"), stage: readChecked("stage"), focus: readChecked("focus") });
  }
  return (
    <>
      <div className="filter-drawer-head"><b>Filters</b><button className="icon-btn" onClick={onClose}><RuwadIcon name="x" size={15} /></button></div>
      <div className="filter-drawer-body">
        <FilterGroup label="Investor Type" options={INVESTOR_TYPES} dataKey="type" checked={filters.type} inputName="type" />
        <FilterGroup label="Location" options={investorCities} dataKey="location" checked={filters.location} inputName="location" />
        <FilterGroup label="Investment Stage" options={STAGES} dataKey="stage" checked={filters.stage} inputName="stage" />
        {!hydrated ? (
          <span className="skel" style={{ width: "60%", display: "block" }} />
        ) : !loggedIn ? (
          <GuestAdvancedFilterGate />
        ) : (
          <FilterGroup label="Healthcare Focus" options={HC_CATEGORIES} dataKey="focus" checked={filters.focus} inputName="focus" />
        )}
      </div>
      <div className="filter-drawer-foot">
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClear}>Clear All</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={apply}>Apply Filters</button>
      </div>
    </>
  );
}
