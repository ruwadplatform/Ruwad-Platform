"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { useSession } from "@/hooks/use-store";
import { capForGuest } from "@/lib/auth-gate";
import { searchIndex, GUEST_SEARCH_CAPS } from "@/lib/search-index";
import { useStartups, useInvestors, useHubs, useResearchInstitutions, useMultinationals, useReports } from "@/hooks/use-directory-data";

/** Ported from renderSearchResults() (js/newsevents.js) — groups matches
 * by entity type, guest-caps each group the same way every directory
 * already does. */
export function SearchResultsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { loggedIn } = useSession();
  const q = params.get("q") ?? "";

  const { data: STARTUPS, loading: l1 } = useStartups();
  const { data: INVESTORS, loading: l2 } = useInvestors();
  const { data: HUBS, loading: l3 } = useHubs();
  const { data: RESEARCH_INSTITUTIONS, loading: l4 } = useResearchInstitutions();
  const { data: MULTINATIONALS, loading: l5 } = useMultinationals();
  const { data: REPORTS, loading: l6 } = useReports();
  const loading = l1 || l2 || l3 || l4 || l5 || l6;

  const groups = useMemo(() => {
    const results = searchIndex(STARTUPS, INVESTORS, HUBS, RESEARCH_INSTITUTIONS, MULTINATIONALS, REPORTS).filter((r) => r.label.toLowerCase().includes(q.toLowerCase()));
    const m: Record<string, typeof results> = {};
    results.forEach((r) => { (m[r.type] ??= []).push(r); });
    return m;
  }, [STARTUPS, INVESTORS, HUBS, RESEARCH_INSTITUTIONS, MULTINATIONALS, REPORTS, q]);

  const totalResults = Object.values(groups).reduce((a, g) => a + g.length, 0);

  return (
    <div>
      <div className="page-head"><h2>Search results for &quot;{q}&quot;</h2><p className="muted small">{loading ? "Searching…" : `${totalResults} result${totalResults === 1 ? "" : "s"}`}</p></div>
      {loading ? (
        <EmptyState icon="search" title="Searching…" body="" />
      ) : !Object.keys(groups).length ? (
        <EmptyState icon="search" title="No results found" body="Try a different search term." />
      ) : (
        Object.entries(groups).map(([type, items]) => {
          const { shown, capped } = loggedIn ? { shown: items, capped: false } : capForGuest(items, GUEST_SEARCH_CAPS[type] ?? 3, true);
          return (
            <div key={type}>
              <div className="panel-head" style={{ border: "none", padding: "6px 0 10px" }}><h3 className="fs-14">{type}</h3></div>
              <div className="panel mb-24">
                {shown.map((r) => (
                  <div key={r.route} className="event-item" style={{ cursor: "pointer" }} onClick={() => router.push(r.route)}>
                    <b>{r.label}</b>
                    <div className="small muted mt-8">{r.sub}</div>
                  </div>
                ))}
              </div>
              {capped && <DirectoryGateBanner entityLabelPlural={type} totalCount={items.length} />}
            </div>
          );
        })
      )}
    </div>
  );
}
