"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { fetchAdvisors } from "@/lib/api/advisory";
import { AdvisorCard } from "./AdvisorCard";
import { APPLY_QUERY, BecomeAdvisorModal, useBecomeAdvisor } from "./BecomeAdvisor";
import { HowItWorksModal } from "./HowItWorksModal";
import { nextAvailableSlot } from "./advisory-availability";
import { filterAdvisors, filterOptions, sortAdvisors } from "./advisory-filter";
import { CONSULTATION_TYPES, EMPTY_ADVISOR_FILTERS, type AdvisorFilters, type AdvisorSummary, type AvailabilityFilter, type SortMode, type ViewMode } from "./advisory-types";

const AVAILABILITY_OPTIONS: { value: AvailabilityFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Available today" },
  { value: "week", label: "Within 7 days" },
  { value: "twoWeeks", label: "Within 14 days" },
];

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="adv-crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={it.label} className="adv-crumb">
          {i > 0 && <RuwadIcon name="chevron" size={12} />}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Discover → Advisory Services: the advisor directory. Search, four filters (they combine), sorting, and a grid or list view. */
export function AdvisoryServicesPage() {
  const { openModal } = useModal();
  const { loggedIn, hydrated } = useSession();
  const becomeAdvisor = useBecomeAdvisor();
  const [advisors, setAdvisors] = useState<AdvisorSummary[] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<AdvisorFilters>(EMPTY_ADVISOR_FILTERS);
  const [sort, setSort] = useState<SortMode>("relevance");
  const [view, setView] = useState<ViewMode>("grid");
  const [now, setNow] = useState(() => new Date());
  const [filtersOpen, setFiltersOpen] = useState(false); // phones only: the four selects collapse behind a Filters button
  const ids = { search: useId(), spec: useId(), inst: useId(), type: useId(), avail: useId(), sort: useId(), grid: useId() };

  // Load the directory, and reload it when the tab regains focus and every few minutes, so "Next available" (worked out by the server from live
  // bookings) doesn't go stale while the page sits open. A failed background refresh keeps what is already on screen.
  useEffect(() => {
    let alive = true;
    const load = (initial: boolean) =>
      fetchAdvisors()
        .then((a) => { if (alive) { setAdvisors(a); setNow(new Date()); setError(""); } })
        .catch(() => { if (alive && initial) setError("The advisor list couldn't be loaded. Please try again in a moment."); });
    void load(true);
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 5 * 60_000);
    return () => { alive = false; document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); clearInterval(timer); };
  }, []);

  // Coming back from signing in to apply: the address carries ?apply=1, so the application opens by itself, once, and the marker is dropped from the address.
  useEffect(() => {
    if (!hydrated || !loggedIn || typeof window === "undefined" || window.location.search !== `?${APPLY_QUERY}`) return;
    window.history.replaceState(null, "", window.location.pathname);
    openModal(<BecomeAdvisorModal />, "wide");
  }, [hydrated, loggedIn, openModal]);

  const options = useMemo(() => filterOptions(advisors ?? []), [advisors]);
  const results = useMemo(() => sortAdvisors(filterAdvisors(advisors ?? [], filters, now), sort, filters.query), [advisors, filters, sort, now]);
  const slots = useMemo(() => new Map((advisors ?? []).map((a) => [a.id, nextAvailableSlot(a, now)])), [advisors, now]);
  const filtersActive = filters.query.trim() !== "" || filters.specialization !== "" || filters.institution !== "" || filters.consultationType !== "" || filters.availability !== "any";
  const activeFilterCount = [filters.specialization, filters.institution, filters.consultationType].filter(Boolean).length + (filters.availability !== "any" ? 1 : 0);
  const set = <K extends keyof AdvisorFilters>(k: K, v: AdvisorFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="advisory-page">
      <Breadcrumbs items={[{ label: "Discover" }, { label: "Advisory Services" }]} />

      <section className="adv-hero panel">
        <span className="adv-hero-icon" aria-hidden="true"><RuwadIcon name="calendar" size={30} /></span>
        <div className="adv-hero-text">
          <PageHeader variant="block" title="Advisory Services" description="Connect with specialized professors, scientists, and advisors from Saudi Arabia's leading research institutions." />
        </div>
        <div className="adv-hero-actions">
          <button type="button" className="btn btn-outline adv-how-btn" onClick={() => openModal(<HowItWorksModal />, "wide")}>
            <RuwadIcon name="info" size={15} /> How It Works
          </button>
          <button type="button" className="btn btn-primary adv-become-btn" onClick={becomeAdvisor}>
            <RuwadIcon name="plus" size={15} /> Become an Advisor
          </button>
        </div>
      </section>

      <section className="adv-filters panel panel-pad" aria-label="Search and filter advisors">
        <div className="toolbar-search adv-search">
          <RuwadIcon name="search" size={15} />
          <input
            id={ids.search}
            type="search"
            aria-label="Search advisors by name, institution, specialization or expertise"
            placeholder="Search experts, specializations, or institutions..."
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-outline adv-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls={ids.grid}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filters{activeFilterCount > 0 && <span className="adv-filter-badge" aria-label={`${activeFilterCount} active`}>{activeFilterCount}</span>}
        </button>
        <div id={ids.grid} className={`adv-filter-grid${filtersOpen ? " is-open" : ""}`}>
          <div className="adv-field">
            <label htmlFor={ids.spec}>Specialization</label>
            <select id={ids.spec} className="select" value={filters.specialization} onChange={(e) => set("specialization", e.target.value)}>
              <option value="">All specializations</option>
              {options.specializations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="adv-field">
            <label htmlFor={ids.inst}>Institution</label>
            <select id={ids.inst} className="select" value={filters.institution} onChange={(e) => set("institution", e.target.value)}>
              <option value="">All institutions</option>
              {options.institutions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="adv-field">
            <label htmlFor={ids.type}>Consultation Type</label>
            <select id={ids.type} className="select" value={filters.consultationType} onChange={(e) => set("consultationType", e.target.value as AdvisorFilters["consultationType"])}>
              <option value="">All types</option>
              {CONSULTATION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} · {t.minutes} min</option>)}
            </select>
          </div>
          <div className="adv-field">
            <label htmlFor={ids.avail}>Availability</label>
            <select id={ids.avail} className="select" value={filters.availability} onChange={(e) => set("availability", e.target.value as AvailabilityFilter)}>
              {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="adv-results panel" aria-label="Results">
        <div className="adv-count" role="status" aria-live="polite">
          <b>{advisors ? results.length : "–"}</b> {results.length === 1 ? "advisor" : "advisors"}
          {filtersActive && <button type="button" className="btn btn-ghost btn-sm adv-clear" onClick={() => setFilters(EMPTY_ADVISOR_FILTERS)}>Clear filters</button>}
        </div>
        <div className="adv-results-controls">
          <label className="adv-sort" htmlFor={ids.sort}>
            <span>Sort by</span>
            <select id={ids.sort} className="select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="relevance">Relevance</option>
              <option value="experience">Experience</option>
            </select>
          </label>
          <div className="seg-tabs adv-view" role="group" aria-label="View">
            <button type="button" className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")}><RuwadIcon name="grid" size={14} /></button>
            <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")}><RuwadIcon name="rows" size={14} /></button>
          </div>
        </div>
      </section>

      {advisors?.some((a) => a.isDemo) && <p className="adv-note"><RuwadIcon name="info" size={14} /> Demonstration data: the advisors below are fictional placeholder profiles. They are not real people, and no affiliation with the institutions shown is claimed.</p>}

      {error ? (
        <ErrorState title="Couldn't load advisors" body={error} />
      ) : !advisors ? (
        <LoadingState title="Loading advisors…" />
      ) : advisors.length === 0 ? (
        <EmptyState icon="info" title="No advisors are listed yet" body="Advisors appear here once their application has been approved. Please check back soon." />
      ) : results.length === 0 ? (
        <EmptyState icon="search" title="No advisors match those filters" body="Try a different search term or clear a filter." action={<button type="button" className="btn btn-outline" onClick={() => setFilters(EMPTY_ADVISOR_FILTERS)}>Clear filters</button>} />
      ) : (
        <div className={`adv-grid${view === "list" ? " is-list" : ""}`}>
          {results.map((a) => <AdvisorCard key={a.id} advisor={a} view={view} nextSlot={slots.get(a.id) ?? null} />)}
        </div>
      )}
    </div>
  );
}
