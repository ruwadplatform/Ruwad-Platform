"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState } from "@/components/shared/EmptyState";
import { useHubs } from "@/hooks/use-directory-data";
import type { Hub } from "@/types/entities";

interface OppRow {
  hubId: string; hubName: string; program: string; type: string; status: string;
  duration: string; format: string; location: string; deadline: string; stage: string;
}

function opportunitiesData(HUBS: Hub[]): OppRow[] {
  const rows: OppRow[] = [];
  HUBS.forEach((h) => {
    h.programs.forEach((p) => {
      rows.push({
        hubId: h.id, hubName: h.name, program: p.name, type: p.type, status: p.status,
        duration: p.duration, format: p.format, location: p.location || h.city,
        deadline: p.deadline, stage: h.eligibility?.stage || "—",
      });
    });
  });
  return rows;
}

/** Ported from renderOpportunities() (js/opportunities.js) — flattens
 * HUBS[].programs[] into one browsable, applyable list. No new data
 * model; every field already exists per hub. */
export function OpportunitiesPage() {
  const router = useRouter();
  const { data: HUBS, loading, error } = useHubs();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");

  const all = useMemo(() => opportunitiesData(HUBS), [HUBS]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => (status === "all" || r.status.toLowerCase() === status) && (!q || r.program.toLowerCase().includes(q) || r.hubName.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)))
      .sort((a, b) => (a.status !== b.status ? (a.status === "Open" ? -1 : 1) : a.hubName.localeCompare(b.hubName)));
  }, [all, search, status]);

  const openCount = all.filter((r) => r.status === "Open").length;

  return (
    <div className="opportunities-page">
      <div className="page-head">
        <h2>Opportunities Marketplace</h2>
        <p className="muted small">Every accelerator, incubator, sandbox and funding program currently listed across RUWĀD&apos;s Hubs &amp; Enablers directory — one applyable list instead of an organization-by-organization search.</p>
      </div>
      <div className="toolbar">
        <div className="toolbar-search"><RuwadIcon name="search" size={14} /><input placeholder="Search programs or organizations" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="select" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value as "all" | "open" | "closed")}>
          <option value="all">All Statuses</option>
          <option value="open">Open Now</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading programs…" : `${list.length} program${list.length === 1 ? "" : "s"} · ${openCount} open now across ${HUBS.length} organizations`}</div>
      {error ? (
        <EmptyState icon="help" title="Couldn't load programs" body={error} />
      ) : loading ? (
        <EmptyState icon="search" title="Loading programs…" body="" />
      ) : !list.length ? (
        <EmptyState icon="search" title="No programs match those filters" body="Try clearing the search or status filter." />
      ) : (
        <div className="panel scroll-x">
          <table className="data-table">
            <thead><tr><th>Program</th><th>Host Organization</th><th>Type</th><th>Stage</th><th>Format / Location</th><th>Deadline</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} style={{ cursor: "pointer" }} onClick={() => router.push(`/hubs/${r.hubId}`)}>
                  <td><div className="cell-main">{r.program}</div><div className="cell-sub">{r.duration || "—"}</div></td>
                  <td>{r.hubName}</td>
                  <td>{r.type}</td>
                  <td className="cell-sub">{r.stage}</td>
                  <td className="cell-sub">{r.format || "—"} · {r.location}</td>
                  <td className="cell-sub">{r.deadline}</td>
                  <td><span className={`badge ${r.status === "Open" ? "badge-good" : "badge-neutral"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
