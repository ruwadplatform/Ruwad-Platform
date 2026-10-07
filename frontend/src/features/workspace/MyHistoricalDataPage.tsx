"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { useKeyedResource } from "@/hooks/use-async-resource";
import { fetchStartupBySlug } from "@/lib/api/startups";
import { fetchDataRoomStatus } from "@/lib/api/data-room";
import { ApiError } from "@/lib/api/client";
import {
  fetchHistoricalOptions, fetchMyHistoricalEntries, submitHistoricalEntry, reviseHistoricalEntry, withdrawHistoricalEntry,
  type FounderHistoricalEntry, type HistoricalOptions, type HistoricalReviewStatus, type HistoricalSubmissionKind,
} from "@/lib/api/historical-performance";
import { buildEntry, KIND_FIELDS, KIND_HELP, KIND_LABEL, summarizeEntry, valuesFromPayload } from "./historical-entry-forms";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

const STATUS_BADGE: Record<HistoricalReviewStatus, { cls: string; label: string }> = {
  PENDING_REVIEW: { cls: "badge-neutral", label: "Waiting for review" },
  CHANGES_REQUESTED: { cls: "badge-warn", label: "Changes requested" },
  VERIFIED: { cls: "badge-good", label: "Reviewed" },
  REJECTED: { cls: "badge-crit", label: "Not accepted" },
};

/** The founder's OPTIONAL "Historical Performance" section. Private to the
 * company and RUWĀD's team; nothing here is shown on the public profile, and
 * it is never presented as a way to change a score. Entries are reviewed by
 * RUWĀD before they are used for analytics. */
export function MyHistoricalDataPage({ slug }: { slug: string }) {
  const { loggedIn, hydrated } = useSession();
  const toast = useToast();
  const { data: s, loading, error } = useKeyedResource(slug, fetchStartupBySlug);
  const entityId = s?.entityId ?? null;

  const [options, setOptions] = useState<HistoricalOptions | null>(null);
  const [entries, setEntries] = useState<FounderHistoricalEntry[] | null>(null);
  const [documents, setDocuments] = useState<{ id: string; name: string; onFile: boolean }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<HistoricalSubmissionKind>("REVENUE");
  const [values, setValues] = useState<Record<string, string>>({});
  const [docType, setDocType] = useState("");
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<FounderHistoricalEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!entityId) return;
    Promise.all([fetchHistoricalOptions(entityId), fetchMyHistoricalEntries(entityId)])
      .then(([o, e]) => { setOptions(o); setEntries(e); })
      .catch((err) => setLoadError(errText(err)));
    fetchDataRoomStatus("STARTUP", entityId).then((r) => setDocuments(r.documents)).catch(() => setDocuments([]));
  }, [entityId]);
  useEffect(load, [load]);

  function reset() { setValues({}); setDocType(""); setDocId(""); setNote(""); setEditing(null); }

  function startEdit(e: FounderHistoricalEntry) {
    setEditing(e); setKind(e.kind);
    setValues(valuesFromPayload(e.kind, e.payload));
    setDocType(e.supportingDocumentType ?? ""); setDocId(e.supportingDocumentId ?? ""); setNote(e.founderNote ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!entityId) return;
    setBusy(true);
    try {
      const body = { entry: buildEntry(kind, values), supportingDocumentId: docId || undefined, supportingDocumentType: docType || undefined, founderNote: note.trim() || undefined };
      if (editing) { await reviseHistoricalEntry(entityId, editing.id, body); toast("Updated and sent for review"); }
      else { await submitHistoricalEntry(entityId, { kind, ...body }); toast("Saved and sent for review"); }
      reset(); load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function withdraw(e: FounderHistoricalEntry) {
    if (!entityId) return;
    try { await withdrawHistoricalEntry(entityId, e.id); toast("Entry withdrawn"); if (editing?.id === e.id) reset(); load(); } catch (err) { toast(errText(err)); }
  }

  const header = <IntelligencePageHeader title="Historical Performance" description="Optional. Help RUWĀD understand how your company has grown over time." action={<Link className="btn btn-outline btn-sm" href={`/workspace/startup/${slug}`}>Back to My Startup</Link>} />;

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;
  if (loading) return <div>{header}<div className="mt-20"><EmptyState icon="mystartup" title="Loading…" body="" /></div></div>;
  if (error || loadError) return <div>{header}<div className="mt-20"><EmptyState icon="help" title="Couldn't load this section" body={error ?? loadError ?? ""} /></div></div>;
  if (!s || !entityId) return <div>{header}<div className="mt-20"><EmptyState icon="mystartup" title="No company linked to your account yet" body="Once your company profile is approved, you can add its history here." /></div></div>;
  if (!options || !entries) return <div>{header}<div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div></div>;

  const fields = KIND_FIELDS[kind].filter((f) => !f.showIf || f.showIf(values));
  const missingRequired = fields.some((f) => f.required && !(values[f.name] ?? "").trim());

  return (
    <div>
      {header}

      <div className="panel panel-pad mt-16">
        <p className="small">Providing historical information helps RUWĀD understand your company&rsquo;s growth over time and improves the reliability of analytics.</p>
        <ul className="small muted mt-8" style={{ paddingLeft: 18 }}>
          <li>Everything here is optional. You can leave this page empty.</li>
          <li>It is private to your company and RUWĀD&rsquo;s team. It is never shown on your public profile.</li>
          <li>RUWĀD reviews every entry before it is used. A supporting document helps the review.</li>
        </ul>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">{editing ? "Revise entry" : "Add an entry"}</h3>
        {editing?.reviewNotes && <p className="small mb-12" style={{ color: "var(--warn)" }}>RUWĀD asked: {editing.reviewNotes}</p>}
        <div className="field">
          <label>What would you like to add?</label>
          <select className="select" value={kind} disabled={!!editing} onChange={(e) => { setKind(e.target.value as HistoricalSubmissionKind); setValues({}); }}>
            {options.kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <p className="small muted mt-8">{KIND_HELP[kind]}</p>
        </div>
        <div className="grid-2 mt-12">
          {fields.map((f) => (
            <div className="field" key={f.name} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
              <label>{f.label}{f.required ? " *" : ""}</label>
              {f.type === "select" ? (
                <select className="select" value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                  <option value="">Select…</option>
                  {(f.options?.(options) ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea className="input" rows={3} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              ) : (
                <input className="input" type={f.type} step={f.type === "number" && !f.integer ? "any" : undefined} min={f.type === "number" ? 0 : undefined} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              )}
              {f.hint && <p className="small muted mt-8">{f.hint}</p>}
            </div>
          ))}
        </div>

        <h4 className="fs-12 muted mt-16 mb-8">Supporting document (optional)</h4>
        <div className="grid-2">
          <div className="field">
            <label>Type of document</label>
            <select className="select" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="">None</option>
              {options.supportingDocumentTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="field">
            <label>From your Data Room</label>
            <select className="select" value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">None</option>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.name}{d.onFile ? "" : " (not provided yet)"}</option>)}
            </select>
          </div>
        </div>
        <div className="field mt-12"><label>Note for the reviewer (optional)</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>

        <div className="flex gap-8 mt-16">
          <button className="btn btn-primary btn-sm" disabled={busy || missingRequired} onClick={save}>{editing ? "Send revised entry" : "Save entry"}</button>
          {(editing || Object.keys(values).length > 0) && <button className="btn btn-outline btn-sm" onClick={reset}>Clear</button>}
        </div>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Your entries</h3>
        {entries.length === 0 ? <p className="small muted">Nothing added yet.</p> : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Entry</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{KIND_LABEL[e.kind]}</td>
                    <td className="small">{summarizeEntry(e.kind, e.payload)}{e.reviewNotes && <div className="muted">{e.reviewNotes}</div>}</td>
                    <td><span className={`badge ${STATUS_BADGE[e.reviewStatus].cls}`}>{STATUS_BADGE[e.reviewStatus].label}</span></td>
                    <td>
                      <div className="flex gap-8">
                        {(e.reviewStatus === "CHANGES_REQUESTED" || e.reviewStatus === "PENDING_REVIEW") && <button className="btn btn-outline btn-sm" onClick={() => startEdit(e)}>Edit</button>}
                        {e.reviewStatus !== "VERIFIED" && <button className="btn btn-outline btn-sm" onClick={() => withdraw(e)}>Withdraw</button>}
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
