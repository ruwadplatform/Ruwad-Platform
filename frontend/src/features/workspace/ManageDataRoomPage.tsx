"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useToast } from "@/components/shell/ToastProvider";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { useKeyedResource } from "@/hooks/use-async-resource";
import { fetchStartupBySlug } from "@/lib/api/startups";
import { ApiError } from "@/lib/api/client";
import {
  ACCEPTED_EXTENSIONS, CHECKLIST_CATEGORIES, DATA_ROOM_CATEGORIES, deleteDataRoomFile, downloadDataRoomFile, fetchDataRoomFiles, formatBytes,
  updateDataRoomFile, uploadDataRoomFile, type DataRoomFile, type DataRoomFilesResponse,
} from "@/lib/api/data-room-files";

const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Please try again.");
const dateText = (iso: string) => iso.slice(0, 10);
const extOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

/** The owner's document manager for one startup: upload, categorise, rename, download and delete. Documents are private to the startup's
 * owners and RUWĀD admins; a checklist category (Pitch Deck, Cap Table, ...) also marks that item "On file" on the profile. */
export function ManageDataRoomPage({ slug }: { slug: string }) {
  const { loggedIn, hydrated } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const { data: s, loading, error } = useKeyedResource(slug, fetchStartupBySlug);
  const startupId = s?.entityId ?? null;

  const [data, setData] = useState<DataRoomFilesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(CHECKLIST_CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", category: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    if (!startupId) return;
    fetchDataRoomFiles(startupId).then((r) => { setData(r); setLoadError(null); }).catch((e) => setLoadError(errText(e)));
  }, [startupId]);
  useEffect(() => { reload(); }, [reload]);

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  const back = `/workspace/startup/${slug}`;
  const header = (
    <IntelligencePageHeader
      title="Manage Data Room"
      description={s ? `Documents for ${s.name}. Private to you and the RUWĀD team.` : "Upload and manage your company documents."}
      action={<Link className="btn btn-outline" href={back}>Back to {s?.name ?? "startup"}</Link>}
    />
  );
  if (loading) return <div className="mystartup-page">{header}<EmptyState icon="doc" title="Loading your Data Room…" body="" /></div>;
  if (error || !s) return <div className="mystartup-page">{header}<EmptyState icon="help" title="Couldn't load this startup" body={error ?? "It may not exist, or the service is unavailable."} /></div>;
  if (loadError && !data) return <div className="mystartup-page">{header}<EmptyState icon="help" title="Couldn't open your Data Room" body={loadError} /></div>;

  const files = data?.files ?? [];
  const usage = data?.usage;
  const onFile = new Set(files.map((f) => f.category));
  const checklistDone = CHECKLIST_CATEGORIES.filter((c) => onFile.has(c)).length;
  const usedPct = usage ? Math.min(100, Math.round((usage.bytes / usage.maxBytes) * 100)) : 0;

  async function uploadMany(list: FileList | File[]) {
    if (!startupId) return;
    const picked = Array.from(list);
    let ok = 0;
    for (const file of picked) {
      if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extOf(file.name))) { toast(`${file.name}: unsupported file type.`); continue; }
      setUploading(file.name);
      try {
        await uploadDataRoomFile(startupId, file, category, picked.length === 1 ? title : undefined);
        ok++;
      } catch (e) {
        toast(`${file.name}: ${errText(e)}`);
      }
    }
    setUploading(null);
    if (ok) { setTitle(""); toast(ok === 1 ? "Document uploaded." : `${ok} documents uploaded.`); reload(); }
  }

  function askDelete(f: DataRoomFile) {
    openModal(
      <ConfirmModal
        title="Delete this document?"
        body={`"${f.name}" will be permanently removed from your Data Room. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={closeModal}
        onConfirm={async () => {
          closeModal();
          setBusyId(f.id);
          try { await deleteDataRoomFile(startupId!, f.id); toast("Document deleted."); reload(); } catch (e) { toast(errText(e)); } finally { setBusyId(null); }
        }}
      />,
    );
  }

  async function saveEdit(f: DataRoomFile) {
    setBusyId(f.id);
    try {
      await updateDataRoomFile(startupId!, f.id, { name: draft.name, category: draft.category });
      setEditingId(null);
      toast("Document updated.");
      reload();
    } catch (e) { toast(errText(e)); } finally { setBusyId(null); }
  }

  async function download(f: DataRoomFile) {
    setBusyId(f.id);
    try { await downloadDataRoomFile(startupId!, f); } catch (e) { toast(errText(e)); } finally { setBusyId(null); }
  }

  return (
    <div className="mystartup-page">
      {header}

      <div className="ms-kpis ms-kpis-3">
        <div className="ms-kpi"><span className="ms-eyebrow">Documents</span><b>{files.length}</b><span className="ms-fine">of {usage?.maxFiles ?? 50} allowed</span></div>
        <div className="ms-kpi">
          <span className="ms-eyebrow">Storage used</span>
          <b>{formatBytes(usage?.bytes ?? 0)}</b>
          <span className={`ms-bar ${usedPct >= 90 ? "ms-bar-crit" : ""}`} aria-hidden><span style={{ width: `${usedPct}%` }} /></span>
          <span className="ms-fine">of {formatBytes(usage?.maxBytes ?? 0)}</span>
        </div>
        <div className="ms-kpi"><span className="ms-eyebrow">Standard documents</span><b>{checklistDone} of {CHECKLIST_CATEGORIES.length}</b><span className="ms-fine">on file</span></div>
      </div>

      <div className="ms-dr-grid">
        <section className="ms-card">
          <header className="ms-card-head"><div><h3>Upload documents</h3><p>PDF, Word, Excel, PowerPoint, CSV, text, PNG or JPG. Up to {formatBytes(usage?.maxFileBytes ?? 10 * 1024 * 1024)} each.</p></div></header>
          <div className="ms-dr-fields">
            <label>
              <span className="ms-eyebrow">Category</span>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {DATA_ROOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <span className="ms-eyebrow">Title (optional)</span>
              <input className="input" value={title} maxLength={150} placeholder="Defaults to the file name" onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <div
            className={`ms-drop${dragging ? " ms-drop-on" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void uploadMany(e.dataTransfer.files); }}
          >
            <RuwadIcon name="upload" size={22} />
            {uploading ? <p>Uploading {uploading}…</p> : <p>Drag files here, or</p>}
            <button type="button" className="btn btn-primary" disabled={!!uploading} onClick={() => picker.current?.click()}>Choose files</button>
            <input ref={picker} type="file" multiple hidden accept={ACCEPTED_EXTENSIONS.join(",")} onChange={(e) => { if (e.target.files?.length) void uploadMany(e.target.files); e.target.value = ""; }} />
          </div>
        </section>

        <section className="ms-card">
          <header className="ms-card-head"><div><h3>Standard documents</h3><p>Investors expect these. Uploading one marks it &ldquo;On file&rdquo; on your profile.</p></div></header>
          <ul className="ms-checklist">
            {CHECKLIST_CATEGORIES.map((c) => (
              <li key={c}>
                <span className="ms-check-name">{onFile.has(c) ? <RuwadIcon name="check" size={14} /> : <span className="ms-check-dot" aria-hidden />}{c}</span>
                {onFile.has(c)
                  ? <span className="badge badge-good">On file</span>
                  : <button type="button" className="btn btn-outline btn-sm" onClick={() => { setCategory(c); picker.current?.click(); }}>Upload</button>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="ms-card">
        <header className="ms-card-head"><div><h3>Your documents</h3><p>Only you and the RUWĀD team can open these.</p></div></header>
        {files.length === 0 ? (
          <p className="ms-muted">No documents yet. Upload your first document above.</p>
        ) : (
          <div className="ms-table-wrap">
            <table className="ms-table">
              <thead><tr><th>Document</th><th>Category</th><th>Size</th><th>Uploaded</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    {editingId === f.id ? (
                      <>
                        <td><input className="input" value={draft.name} maxLength={150} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Document name" /></td>
                        <td>
                          <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category">
                            {DATA_ROOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>{formatBytes(f.size)}</td>
                        <td>{dateText(f.uploadedAt)}</td>
                        <td className="ms-table-actions">
                          <button className="btn btn-primary btn-sm" disabled={busyId === f.id || !draft.name.trim()} onClick={() => saveEdit(f)}>Save</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><div className="ms-doc-title"><b>{f.name}</b><span>{f.fileName}</span></div></td>
                        <td><span className="badge badge-neutral">{f.category}</span></td>
                        <td>{formatBytes(f.size)}</td>
                        <td>{dateText(f.uploadedAt)}</td>
                        <td className="ms-table-actions">
                          <button className="btn btn-outline btn-sm" disabled={busyId === f.id} onClick={() => download(f)}>Download</button>
                          <button className="btn btn-outline btn-sm" onClick={() => { setEditingId(f.id); setDraft({ name: f.name, category: f.category }); }}><RuwadIcon name="edit" size={12} /> Edit</button>
                          <button className="btn btn-outline btn-sm" disabled={busyId === f.id} onClick={() => askDelete(f)} aria-label={`Delete ${f.name}`}><RuwadIcon name="trash" size={12} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
