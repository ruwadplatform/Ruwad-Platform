"use client";

import { useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { SectionHeader } from "@/components/intelligence/SectionHeader";
import { FeaturedReport } from "@/components/intelligence/FeaturedReport";
import { ReportCard } from "@/components/intelligence/ReportCard";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { useSession } from "@/hooks/use-store";
import { capForGuest } from "@/lib/auth-gate";
import { useReports } from "@/hooks/use-directory-data";
import { REPORT_CATEGORIES } from "@/data/reference";

type SortKey = "newest" | "pages" | "title";

export function ReportsDirectoryPage() {
  const { loggedIn, hydrated } = useSession();
  const { data: REPORTS, loading, error } = useReports();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<SortKey>("newest");

  const featured = useMemo(() => REPORTS.find((r) => r.badges.includes("Featured")) ?? REPORTS[0], [REPORTS]);

  const filtered = useMemo(() => {
    let list = featured ? REPORTS.filter((r) => r.id !== featured.id) : REPORTS;
    if (category !== "All") list = list.filter((r) => r.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => (a.publicationDate < b.publicationDate ? 1 : -1));
    else if (sort === "pages") sorted.sort((a, b) => b.pages - a.pages);
    else sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [REPORTS, category, search, sort, featured]);

  const { shown, capped } = capForGuest(filtered, 3, !hydrated || !loggedIn);

  return (
    <div className="reports-page">
      <IntelligencePageHeader title="Reports" description="Market intelligence, funding and sector reports across Saudi, GCC and MENA healthcare." />

      {loading ? (
        <div className="empty-state mt-20 mb-24"><RuwadIcon name="search" size={30} /><h4>Loading reports…</h4></div>
      ) : error ? (
        <div className="empty-state mt-20 mb-24"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load reports</h4><p>{error}</p></div>
      ) : featured ? (
        <div className="mt-20 mb-24"><FeaturedReport report={featured} /></div>
      ) : null}

      <div className="toolbar mb-16">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
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
        <div className="empty-state"><RuwadIcon name="reports" size={30} /><h4>No reports have been published yet</h4><p>RUWĀD intelligence reports will appear here once they are available.</p></div>
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
