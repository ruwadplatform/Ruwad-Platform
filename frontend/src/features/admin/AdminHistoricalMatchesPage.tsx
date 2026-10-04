"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { useStartups } from "@/hooks/use-directory-data";
import { fetchHistoricalIdentitiesNeedingReview, confirmHistoricalMatch, rejectHistoricalMatch, createStartupForIdentity, type StartupExternalIdentity } from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

function CreateStartupModal({ onCreate, onCancel }: { onCreate: (input: { category: string; subsector: string; country: string; founded: number; stage: string }) => void; onCancel: () => void }) {
  const [category, setCategory] = useState("");
  const [subsector, setSubsector] = useState("");
  const [country, setCountry] = useState("");
  const [founded, setFounded] = useState(new Date().getFullYear());
  const [stage, setStage] = useState("");
  return (
    <div className="modal-box modal-box-pad">
      <h3 className="fs-14 mb-12">Create New Startup</h3>
      <p className="small muted mb-12">Only fields RUWĀD treats as required are asked here — everything else stays unfilled rather than guessed.</p>
      <div className="grid-2">
        <div className="field"><label>Category</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        <div className="field"><label>Subsector</label><input className="input" value={subsector} onChange={(e) => setSubsector(e.target.value)} /></div>
        <div className="field"><label>Country</label><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <div className="field"><label>Founded Year</label><input className="input" type="number" value={founded} onChange={(e) => setFounded(Number(e.target.value))} /></div>
        <div className="field"><label>Stage</label><input className="input" value={stage} onChange={(e) => setStage(e.target.value)} /></div>
      </div>
      <div className="flex gap-8 mt-16">
        <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!category || !subsector || !country || !stage} onClick={() => onCreate({ category, subsector, country, founded, stage })}>Create</button>
      </div>
    </div>
  );
}

export function AdminHistoricalMatchesPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const { data: startups } = useStartups();

  const [rows, setRows] = useState<StartupExternalIdentity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickStartup, setPickStartup] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchHistoricalIdentitiesNeedingReview().then(setRows).catch((e) => setError(errText(e)));
  }, [isAdmin]);
  useEffect(load, [load]);

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review company matches." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load match review" body={error} /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title="Company Match Review"
        description="Rows from historical imports whose startup identity could not be confirmed automatically. Nothing here was merged into an existing listing without your review."
        action={<Link className="btn btn-outline btn-sm" href="/admin/ml-data/historical">Back to Historical Data</Link>}
      />

      <div className="panel panel-pad mt-16">
        {rows === null ? (
          <p className="small muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="small muted">No rows currently need identity review.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Imported Name</th><th>Source</th><th>Status</th><th>Suggested Match</th><th>Confidence</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{r.companyNameAtSource}{r.domain && <div className="fs-11 muted">{r.domain}</div>}</td>
                    <td className="small">{r.sourceName}</td>
                    <td><span className="badge badge-warn">{r.matchStatus.replace(/_/g, " ")}</span></td>
                    <td>
                      <select className="select" style={{ width: "auto" }} value={pickStartup[r.id] ?? r.startupId ?? ""} onChange={(e) => setPickStartup((p) => ({ ...p, [r.id]: e.target.value }))}>
                        <option value="">Select a startup…</option>
                        {startups.map((s) => <option key={s.entityId} value={s.entityId}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="small">{r.matchConfidence != null ? `${Math.round(r.matchConfidence * 100)}%` : "—"}</td>
                    <td>
                      <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busyKey === r.id || !pickStartup[r.id]}
                          onClick={async () => {
                            setBusyKey(r.id);
                            try { await confirmHistoricalMatch(r.id, pickStartup[r.id]); toast("Match confirmed"); load(); }
                            catch (e) { toast(errText(e)); } finally { setBusyKey(null); }
                          }}
                        >
                          {busyKey === r.id ? "…" : "Confirm Match"}
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openModal(
                            <CreateStartupModal
                              onCancel={closeModal}
                              onCreate={async (input) => {
                                closeModal(); setBusyKey(r.id);
                                try { await createStartupForIdentity(r.id, input); toast("New startup created and linked"); load(); }
                                catch (e) { toast(errText(e)); } finally { setBusyKey(null); }
                              }}
                            />,
                          )}
                        >
                          Create New Startup
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openModal(
                            <ConfirmModal
                              title="Reject this match candidate?"
                              body={`"${r.companyNameAtSource}" will be left unmatched — its evidence stays pending until reviewed again.`}
                              confirmLabel="Reject"
                              danger
                              onCancel={closeModal}
                              onConfirm={async () => {
                                closeModal(); setBusyKey(r.id);
                                try { await rejectHistoricalMatch(r.id); toast("Marked unmatched"); load(); }
                                catch (e) { toast(errText(e)); } finally { setBusyKey(null); }
                              }}
                            />,
                          )}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
