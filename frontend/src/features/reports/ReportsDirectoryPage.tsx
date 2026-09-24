"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { SectionHeader } from "@/components/intelligence/SectionHeader";
import { FeaturedReport } from "@/components/intelligence/FeaturedReport";
import { ReportCard } from "@/components/intelligence/ReportCard";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { useSession } from "@/hooks/use-store";
import { capForGuest } from "@/lib/auth-gate";
import { requireAuth } from "@/lib/store";
import { useReports } from "@/hooks/use-directory-data";
import { ReportAdminPanel } from "./ReportAdminPanel";
import { REPORT_CATEGORIES } from "@/data/reference";

type SortKey = "newest" | "pages" | "title";

/** The directory chips include region labels ("Saudi Healthcare"…) that are not stored as a report's category, so a report also
 * matches a chip through its sector and its geography. This is what lets a community report show up under the same chips as RUWĀD's own. */
const GEOGRAPHY_CHIP: Record<string, string> = { "Saudi Arabia": "Saudi Healthcare", GCC: "GCC Healthcare", MENA: "MENA Healthcare" };
const matchesChip = (r: { category: string; sector: string; geography: string }, chip: string) => r.category === chip || r.sector === chip || GEOGRAPHY_CHIP[r.geography] === chip;

export function ReportsDirectoryPage() {
  const router = useRouter();
  const { loggedIn, hydrated } = useSession();
  const { data: REPORTS, loading, error } = useReports();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<SortKey>("newest");
  const [reportType, setReportType] = useState("All");
  const [sector, setSector] = useState("All");
  const [geography, setGeography] = useState("All");

  const options = useMemo(() => {
    const uniq = (pick: (r: (typeof REPORTS)[number]) => string) => [...new Set(REPORTS.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { types: uniq((r) => r.reportType), sectors: uniq((r) => r.sector), geographies: uniq((r) => r.geography) };
  }, [REPORTS]);

  const featured = useMemo(() => REPORTS.find((r) => r.badges.includes("Featured")) ?? REPORTS.find((r) => r.origin !== "USER_SUBMITTED"), [REPORTS]);

  const filtered = useMemo(() => {
    let list = featured ? REPORTS.filter((r) => r.id !== featured.id) : REPORTS;
    if (category !== "All") list = list.filter((r) => matchesChip(r, category));
    if (reportType !== "All") list = list.filter((r) => r.reportType === reportType);
    if (sector !== "All") list = list.filter((r) => r.sector === sector);
    if (geography !== "All") list = list.filter((r) => r.geography === geography);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => (a.publicationDate < b.publicationDate ? 1 : -1));
    else if (sort === "pages") sorted.sort((a, b) => b.pages - a.pages);
    else sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [REPORTS, category, reportType, sector, geography, search, sort, featured]);

  const { shown, capped } = capForGuest(filtered, 3, !hydrated || !loggedIn);

  return (
    <div className="reports-page">
      <IntelligencePageHeader
        title="Reports"
        description="Market intelligence, funding and sector reports across Saudi, GCC and MENA healthcare."
        action={
          <button className="btn btn-primary" onClick={() => { if (requireAuth("route", { label: "publish-report" }, "/reports/submit")) router.push("/reports/submit"); }}>
            <RuwadIcon name="plus" size={14} /> Publish Report
          </button>
        }
      />

      <ReportAdminPanel />

      {loading ? (
        <div className="empty-state mt-20 mb-24"><RuwadIcon name="search" size={30} /><h4>Loading reports…</h4></div>
      ) : error ? (
        <div className="empty-state mt-20 mb-24"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load reports</h4><p>{error}</p></div>
      ) : featured ? (
        <div className="mt-20 mb-24"><FeaturedReport report={featured} /></div>
      ) : null}

      <div className="toolbar mb-16">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="input" aria-label="Report type" value={reportType} onChange={(e) => setReportType(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="All">All report types</option>
          {options.types.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="input" aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="All">All sectors</option>
          {options.sectors.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="input" aria-label="Geography" value={geography} onChange={(e) => setGeography(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="All">All geographies</option>
          {options.geographies.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ maxWidth: 180 }}>
          <option value="newest">Sort: Newest</option>
          <option value="pages">Sort: Most Pages</option>
          <option value="title">Sort: Title (A–Z)</option>
        </select>
      </div>

      <div className="chip-select mb-24">
        <button className={category === "All" ? "active" : ""} onClick={() => setCategory("All")}>All</button>
        {REPORT_CATEGORIES.map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}
      </div>

      <SectionHeader title="Latest Intelligence" />
      {loading ? (
        <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>Loading reports…</h4></div>
      ) : !REPORTS.length ? (
        <div className="empty-state"><RuwadIcon name="reports" size={30} /><h4>No reports are available yet</h4><p>Reports will appear here as soon as they are available.</p></div>
      ) : !filtered.length ? (
        <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>No reports match those filters</h4><p>Try a different category or search term.</p></div>
      ) : (
        <div className="entity-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
          {shown.map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
      {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Reports" totalCount={filtered.length} />}
    </div>
  );
}
