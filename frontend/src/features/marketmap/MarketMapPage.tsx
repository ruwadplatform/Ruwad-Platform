"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStartups, useInvestors, useHubs, useResearchInstitutions, useMultinationals } from "@/hooks/use-directory-data";
import { HC_CATEGORIES } from "@/data/reference";
import { startupsUrl } from "@/lib/startup-category";
import type { Startup, Investor, Hub, ResearchInstitution, Multinational } from "@/types/entities";

interface MarketMapRow {
  category: string;
  total: number;
  breakdown: { label: string; count: number }[];
}

/** Ported from marketMapData()/renderMarketMap() (js/marketmap.js) — a
 * click-through view over the existing HC_CATEGORIES taxonomy, aggregating
 * how many records across all five directories fall into each category.
 * No new data model; built entirely from the existing datasets. */
function buildMarketMap(
  startups: Startup[], investors: Investor[], hubs: Hub[], research: ResearchInstitution[], multinationals: Multinational[],
): MarketMapRow[] {
  const sources: { label: string; values: () => string[][] }[] = [
    { label: "Startups", values: () => startups.map((s) => [s.category]) },
    { label: "Investors", values: () => investors.map((v) => v.hcFocus) },
    { label: "Hubs & Enablers", values: () => hubs.map((h) => h.healthcareFocus) },
    { label: "Research & Academia", values: () => research.map((r) => r.coreResearchAreas) },
    { label: "Multinationals", values: () => multinationals.map((m) => [m.category]) },
  ];
  return HC_CATEGORIES.map((category) => {
    let total = 0;
    const breakdown = sources.map((src) => {
      const count = src.values().filter((vals) => vals.includes(category)).length;
      total += count;
      return { label: src.label, count };
    });
    return { category, total, breakdown };
  }).sort((a, b) => b.total - a.total);
}

export function MarketMapPage() {
  const router = useRouter();
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();
  const { data: HUBS } = useHubs();
  const { data: RESEARCH_INSTITUTIONS } = useResearchInstitutions();
  const { data: MULTINATIONALS } = useMultinationals();
  const rows = useMemo(
    () => buildMarketMap(STARTUPS, INVESTORS, HUBS, RESEARCH_INSTITUTIONS, MULTINATIONALS),
    [STARTUPS, INVESTORS, HUBS, RESEARCH_INSTITUTIONS, MULTINATIONALS],
  );
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div>
      <div className="page-head">
        <h2>Market Map</h2>
        <p className="muted small">Every tracked startup, investor, hub, research institution and multinational grouped by healthcare category — the same {HC_CATEGORIES.length}-category taxonomy used across RUWĀD&apos;s filters, not a separate dataset.</p>
      </div>
      <div className="mm-grid mt-16">
        {rows.map((r) => {
          const pct = Math.round((r.total / maxTotal) * 100);
          const segments = r.breakdown.filter((b) => b.count > 0);
          return (
            <button key={r.category} className={`mm-tile${r.total === 0 ? " empty" : ""}`} onClick={() => router.push(startupsUrl([r.category]))}>
              <div className="mm-tile-head"><h4>{r.category}</h4><b className="mono">{r.total}</b></div>
              <div className="mm-bar"><div className="mm-bar-fill" style={{ width: `${pct}%` }} /></div>
              <div className="mm-breakdown">
                {segments.length ? segments.map((s) => <span key={s.label}>{s.count} {s.label}</span>) : <span>No tracked entities yet</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
