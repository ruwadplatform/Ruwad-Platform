"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { useStartups } from "@/hooks/use-directory-data";
import {
  fetchHistoricalCohorts, createHistoricalCohort, fetchHistoricalCohortMembers, addHistoricalCohortMember,
  previewHistoricalCohortSnapshots, buildHistoricalCohortSnapshots,
  type HistoricalCohort, type HistoricalCohortMember, type BulkSnapshotReport,
} from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

export function AdminHistoricalCohortsPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { data: startups } = useStartups();

  const [cohorts, setCohorts] = useState<HistoricalCohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<string>("");
  const [members, setMembers] = useState<HistoricalCohortMember[]>([]);
  const [addStartupId, setAddStartupId] = useState("");
  const [snapshotDate, setSnapshotDate] = useState("");
  const [report, setReport] = useState<BulkSnapshotReport | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchHistoricalCohorts().then(setCohorts).catch((e) => setError(errText(e)));
  }, [isAdmin]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!selected) return;
    fetchHistoricalCohortMembers(selected).then(setMembers).catch(() => setMembers([]));
  }, [selected]);

  function selectCohort(id: string) {
    setSelected(id);
    setMembers([]);
    setReport(null);
  }

  async function createCohort() {
    if (!name.trim()) return;
    setBusy(true);
    try { const c = await createHistoricalCohort({ name: name.trim(), region: region.trim() || undefined, category: category.trim() || undefined }); toast("Cohort created"); setName(""); setRegion(""); setCategory(""); load(); selectCohort(c.id); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function addMember() {
    if (!selected || !addStartupId) return;
    setBusy(true);
    try { await addHistoricalCohortMember(selected, addStartupId); toast("Added to cohort"); fetchHistoricalCohortMembers(selected).then(setMembers); setAddStartupId(""); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function preview() {
    if (!selected || !snapshotDate) return;
    setBusy(true);
    try { setReport(await previewHistoricalCohortSnapshots(selected, snapshotDate)); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function build() {
    if (!selected || !snapshotDate) return;
    setBusy(true);
    try { const r = await buildHistoricalCohortSnapshots(selected, snapshotDate, `Bulk cohort import — ${snapshotDate}`); setReport(r); toast(`Created snapshots for ${r.eligible} startup(s)`); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to manage historical cohorts." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load cohorts" body={error} /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title="Historical Cohorts"
        description="Named research groupings (e.g. 'Saudi Digital Health 2022') used for bulk historical-snapshot creation and later imbalance/coverage analysis."
        action={<Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical">Back to Historical Data</Link>}
      />

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">New Cohort</h3>
        <div className="grid-2">
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Saudi Digital Health 2022" /></div>
          <div className="field"><label>Region</label><input className="input" value={region} onChange={(e) => setRegion(e.target.value)} /></div>
          <div className="field"><label>Category</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary btn-sm mt-12" disabled={busy || !name.trim()} onClick={createCohort}>Create Cohort</button>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Cohorts</h3>
        {cohorts === null ? <p className="small muted">Loading…</p> : cohorts.length === 0 ? <p className="small muted">No cohorts yet.</p> : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Region</th><th>Category</th><th></th></tr></thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.id} className={c.id === selected ? "active" : ""} onClick={() => selectCohort(c.id)} style={{ cursor: "pointer" }}>
                    <td className="small">{c.name}</td>
                    <td className="small">{c.region ?? "—"}</td>
                    <td className="small">{c.category ?? "—"}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); selectCohort(c.id); }}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="panel panel-pad mt-16">
          <h3 className="fs-13 mb-12">Members ({members.length})</h3>
          <div className="flex gap-8 mb-12">
            <select className="select" style={{ width: "auto" }} value={addStartupId} onChange={(e) => setAddStartupId(e.target.value)}>
              <option value="">Select a startup…</option>
              {startups.map((s) => <option key={s.entityId} value={s.entityId}>{s.name}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" disabled={busy || !addStartupId} onClick={addMember}>Add</button>
          </div>

          <h4 className="fs-12 muted mb-8">Bulk Historical Snapshot</h4>
          <div className="flex gap-8" style={{ alignItems: "end" }}>
            <div className="field"><label>Snapshot Date</label><input className="input" type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} /></div>
            <button className="btn btn-outline btn-sm" disabled={busy || !snapshotDate} onClick={preview}>Preview (dry run)</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !snapshotDate || !report} onClick={build}>Create Snapshots</button>
          </div>

          {report && (
            <div className="mt-12">
              <div className="stat-mini-row">
                <div className="stat-mini"><div className="sm-label">Eligible</div><div className="sm-val fs-15">{report.eligible}</div></div>
                <div className="stat-mini"><div className="sm-label">Already Exists</div><div className="sm-val fs-15">{report.skippedAlreadyExists}</div></div>
                <div className="stat-mini"><div className="sm-label">Avg Coverage</div><div className="sm-val fs-15">{Math.round(report.averageCoveragePct * 100)}%</div></div>
                <div className="stat-mini"><div className="sm-label">Total Conflicts</div><div className="sm-val fs-15">{report.totalConflicts}</div></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
