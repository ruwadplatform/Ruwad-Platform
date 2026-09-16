"use client";

import { useId, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { CompactLogoUploader } from "./CompactLogoUploader";
import type { FieldDef } from "./schema-types";

export type FieldValue = string | number | boolean | string[] | undefined;

interface FieldProps {
  field: FieldDef;
  value: FieldValue;
  error?: string;
  /** Temporary "AI filled" indicator — set when this field's current value
   * came from AIAutofillCard's extraction and hasn't been manually edited
   * since. Cleared the instant the user changes the field (see
   * SubmissionWizard's updateField). */
  aiFilled?: boolean;
  onChange: (value: FieldValue) => void;
}

function AiFilledBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return <span className="chip-ai-sm" style={{ marginLeft: 6 }}>AI filled</span>;
}

/** Renders one non-repeater field per the shared .field/.input/.select/
 * .textarea/.chip-select/.toggle CSS already built for the submission
 * wizard shell — repeaters are handled separately (Repeater.tsx) since
 * each item recursively renders a set of these. */
export function Field({ field, value, error, aiFilled, onChange }: FieldProps) {
  const id = useId();
  const invalid = !!error;

  if (field.type === "boolean") {
    const on = !!value;
    return (
      <div className={`field${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}<AiFilledBadge show={aiFilled} /></label>
        <button type="button" id={id} className={`toggle${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(!on)} />
        {field.hint && <div className="hint">{field.hint}</div>}
      </div>
    );
  }

  if (field.type === "image-upload") {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <CompactLogoUploader value={typeof value === "string" ? value : undefined} onChange={onChange} />
        <div className="err"><RuwadIcon name="help" size={12} /> {error}</div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}<AiFilledBadge show={aiFilled} /></label>
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
        <label>{field.label}{field.required && <span className="req">*</span>}<AiFilledBadge show={aiFilled} /></label>
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
    return <TagListField field={field} value={Array.isArray(value) ? value : []} error={error} aiFilled={aiFilled} onChange={onChange} />;
  }

  if (field.type === "number") {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}<AiFilledBadge show={aiFilled} /></label>
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
        <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}<AiFilledBadge show={aiFilled} /></label>
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
      <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}<AiFilledBadge show={aiFilled} /></label>
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
function TagListField({ field, value, error, aiFilled, onChange }: { field: FieldDef; value: string[]; error?: string; aiFilled?: boolean; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const invalid = !!error;

  if (field.type === "document-checklist" && field.options) {
    return (
      <div className={`field${invalid ? " invalid" : ""}${field.full ? " field-full" : ""}`}>
        <label>{field.label}<AiFilledBadge show={aiFilled} /></label>
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
      <label htmlFor={id}>{field.label}<AiFilledBadge show={aiFilled} /></label>
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

