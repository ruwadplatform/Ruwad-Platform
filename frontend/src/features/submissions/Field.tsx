"use client";

import { useId, useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { uploadLogo, logoUrl } from "@/lib/api/uploads";
import { ApiError } from "@/lib/api/client";
import type { FieldDef } from "./schema-types";

export type FieldValue = string | number | boolean | string[] | undefined;

interface FieldProps {
  field: FieldDef;
  value: FieldValue;
  error?: string;
  onChange: (value: FieldValue) => void;
}

/** Renders one non-repeater field per the shared .field/.input/.select/
 * .textarea/.chip-select/.toggle CSS already built for the submission
 * wizard shell — repeaters are handled separately (Repeater.tsx) since
 * each item recursively renders a set of these. */
export function Field({ field, value, error, onChange }: FieldProps) {
  const id = useId();
  const invalid = !!error;

  if (field.type === "boolean") {
    const on = !!value;
    return (
      <div className={`field${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}</label>
        <button type="button" id={id} className={`toggle${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(!on)} />
        {field.hint && <div className="hint">{field.hint}</div>}
      </div>
    );
  }

  if (field.type === "image-upload") {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label>{field.label}{field.required && <span className="req">*</span>}</label>
        <LogoUploadField value={typeof value === "string" ? value : undefined} onChange={onChange} />
        {field.hint && <div className="hint">{field.hint}</div>}
        <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}</label>
        <select id={id} className="select" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {field.hint && <div className="hint">{field.hint}</div>}
        <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
      </div>
    );
  }

  if (field.type === "chips") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label>{field.label}{field.required && <span className="req">*</span>}</label>
        <div className="chip-select">
          {field.options?.map((o) => (
            <button
              key={o}
              type="button"
              className={selected.includes(o) ? "active" : ""}
              onClick={() => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])}
            >
              {o}
            </button>
          ))}
        </div>
        {field.hint && <div className="hint">{field.hint}</div>}
        <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
      </div>
    );
  }

  if (field.type === "string-array" || field.type === "document-checklist") {
    return <TagListField field={field} value={Array.isArray(value) ? value : []} error={error} onChange={onChange} />;
  }

  if (field.type === "number") {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}</label>
        <input
          id={id} type="number" className="input" placeholder={field.placeholder}
          min={field.min} max={field.max}
          value={value === undefined || value === "" ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {field.hint && <div className="hint">{field.hint}</div>}
        <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
      </div>
    );
  }

  if (field.type === "textarea") {
    const text = typeof value === "string" ? value : "";
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}</label>
        <textarea
          id={id} className="textarea" rows={field.rows ?? 3} placeholder={field.placeholder}
          maxLength={field.maxLength} value={text} onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex" style={{ justifyContent: "space-between" }}>
          <div className="hint">{field.hint}</div>
          {field.maxLength && <span className={`char-counter char-counter-focus-only${text.length > field.maxLength * 0.9 ? " char-counter-warn" : ""}`}>{text.length}/{field.maxLength}</span>}
        </div>
        <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
      </div>
    );
  }

  // text
  const text = typeof value === "string" ? value : "";
  return (
    <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
      <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}</label>
      <input id={id} type="text" className="input" placeholder={field.placeholder} maxLength={field.maxLength} value={text} onChange={(e) => onChange(e.target.value)} />
      <div className="flex" style={{ justifyContent: "space-between" }}>
        <div className="hint">{field.hint}</div>
        {field.maxLength && <span className={`char-counter char-counter-focus-only${text.length > field.maxLength * 0.9 ? " char-counter-warn" : ""}`}>{text.length}/{field.maxLength}</span>}
      </div>
      <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
    </div>
  );
}

/** Shared by string-array (free-text tags) and document-checklist (tags
 * chosen from a fixed vocabulary of document names — the publisher writes
 * these as DocumentRef rows with onFile:false, i.e. "can provide on
 * request" metadata, never an actual upload — see the platform-wide
 * no-fake-file-storage rule). */
function TagListField({ field, value, error, onChange }: { field: FieldDef; value: string[]; error?: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const invalid = !!error;

  if (field.type === "document-checklist" && field.options) {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label>{field.label}</label>
        <div className="chip-select">
          {field.options.map((o) => (
            <button key={o} type="button" className={value.includes(o) ? "active" : ""} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
              {o}
            </button>
          ))}
        </div>
        {field.hint && <div className="hint">{field.hint}</div>}
      </div>
    );
  }

  function addTag() {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  }

  return (
    <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
      <label htmlFor={id}>{field.label}</label>
      <input
        id={id} type="text" className="input" placeholder={field.placeholder ?? "Type and press Enter"}
        value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
      />
      {value.length > 0 && (
        <div className="chip-select" style={{ marginTop: 8 }}>
          {value.map((t) => (
            <button key={t} type="button" className="active" onClick={() => onChange(value.filter((x) => x !== t))}>
              {t} <RuwadIcon name="x" size={11} />
            </button>
          ))}
        </div>
      )}
      {field.hint && <div className="hint">{field.hint}</div>}
      <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
    </div>
  );
}

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Uploads immediately on file selection (not on form submit) — the field
 * stores the resulting image id, matching every other field's contract of
 * holding a plain payload value rather than a File object the rest of the
 * wizard (autosave, JSON payload, DTO validation) has no way to carry. */
function LogoUploadField({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingUrl = logoUrl(value);
  const displayUrl = previewUrl ?? existingUrl;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setUploadError("Must be a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError("Must be 2MB or smaller.");
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { id } = await uploadLogo(file);
      onChange(id);
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Upload failed — please try again.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef} type="file" accept={ALLOWED_LOGO_TYPES.join(",")} style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div
        className={`upload-box${displayUrl ? " has-file" : ""}`}
        style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}
        onClick={() => inputRef.current?.click()}
      >
        {displayUrl ? (
          <img src={displayUrl} alt="Logo preview" style={{ width: 48, height: 48, borderRadius: "var(--radius-card)", objectFit: "contain", background: "#fff", flex: "none" }} />
        ) : (
          <RuwadIcon name="upload" size={20} />
        )}
        <div style={{ flex: 1 }}>
          {uploading ? "Uploading…" : displayUrl ? "Logo uploaded — click to replace" : "Click to upload a logo"}
          <div className="hint">PNG, JPEG, WebP or SVG, up to 2MB.</div>
        </div>
      </div>
      {uploadError && <div className="err" style={{ display: "flex" }}><RuwadIcon name="help" size={12} /> {uploadError}</div>}
    </div>
  );
}
