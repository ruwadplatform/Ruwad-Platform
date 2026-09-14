"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useToast } from "@/components/shell/ToastProvider";
import { useSavedSearchActions } from "@/hooks/use-store";
import type { SavedSearch } from "@/lib/store";

const ENTITY_ROUTES: Record<string, string> = {
  startups: "/startups", investors: "/investors", hubs: "/hubs", research: "/research", multinationals: "/multinationals",
};
const ENTITY_LABELS: Record<string, string> = {
  startups: "Startups", investors: "Investors", hubs: "Hubs & Enablers", research: "Research & Academia", multinationals: "Multinationals",
};

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function SavedSearchCard({ search: s }: { search: SavedSearch }) {
  const router = useRouter();
  const toast = useToast();
  const { remove, rename, toggleAlert, markRun } = useSavedSearchActions();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(s.label);

  const filterEntries = Object.entries(s.filters).filter(([, v]) => v.length > 0);

  function runSearch() {
    markRun(s.id);
    const base = ENTITY_ROUTES[s.entityType] ?? "/startups";
    const categoryFilter = s.filters.category;
    const url = s.entityType === "startups" && categoryFilter?.length === 1 ? `${base}?cat=${encodeURIComponent(categoryFilter[0])}` : base;
    if (url === base && filterEntries.length > 0) toast(`Showing the ${ENTITY_LABELS[s.entityType] ?? s.entityType} directory — reapply the filters shown below`);
    router.push(url);
  }

  function saveLabel() {
    rename(s.id, label.trim() || s.label);
    setEditing(false);
  }

  return (
    <div className="panel panel-pad">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          {editing ? (
            <div className="flex gap-8" style={{ alignItems: "center" }}>
              <input className="input" style={{ maxWidth: 260 }} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
              <button className="btn btn-primary btn-sm" onClick={saveLabel}>Save</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setLabel(s.label); setEditing(false); }}>Cancel</button>
            </div>
          ) : (
            <b className="fs-13">{s.label}</b>
          )}
          <div className="small muted mt-4">{ENTITY_LABELS[s.entityType] ?? s.entityType}{s.search ? ` · "${s.search}"` : ""}</div>
        </div>
        <button className={`save-star${s.alertEnabled ? " saved" : ""}`} title={s.alertEnabled ? "Alert on" : "Alert off"} onClick={() => toggleAlert(s.id)}>
          <RuwadIcon name="bell" size={15} />
        </button>
      </div>

      {filterEntries.length > 0 && (
        <div className="flex gap-6 mt-12" style={{ flexWrap: "wrap" }}>
          {filterEntries.map(([k, vals]) => vals.map((v) => <span className="tag" key={k + v}>{v}</span>))}
        </div>
      )}

      <div className="stat-mini-row mt-16">
        <div className="stat-mini"><div className="sm-label">Result Count</div><div className="sm-val fs-15">{s.resultCountAtSave}</div></div>
        <div className="stat-mini"><div className="sm-label">Created</div><div className="sm-val fs-15">{fmtDate(s.createdAt)}</div></div>
        <div className="stat-mini"><div className="sm-label">Last Run</div><div className="sm-val fs-15">{s.lastRunAt ? fmtDate(s.lastRunAt) : "Never"}</div></div>
        <div className="stat-mini"><div className="sm-label">Alerts</div><div className="sm-val fs-15">{s.alertEnabled ? "On" : "Off"}</div></div>
      </div>

      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={runSearch}><RuwadIcon name="search" size={13} /> Run Search</button>
        {!editing && <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}><RuwadIcon name="edit" size={13} /> Rename</button>}
        <button className="btn btn-outline btn-sm" onClick={() => remove(s.id)}><RuwadIcon name="trash" size={13} /> Delete</button>
      </div>
    </div>
  );
}
