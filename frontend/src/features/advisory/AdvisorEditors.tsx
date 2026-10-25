"use client";

import { useId, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useToast } from "@/components/shell/ToastProvider";
import type { ServiceInput, ServiceRow } from "@/lib/api/advisory";
import { WEEKDAY_NAMES, formatWallClock } from "./advisory-time";
import { CONSULTATION_TYPES, type AdvisorApplication, type AvailabilityState } from "./advisory-types";
import { errText } from "./booking-format";

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Field({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="adv-bfield">
      <label htmlFor={id}>{label}{hint && <span className="muted"> {hint}</span>}</label>
      {children}
    </div>
  );
}

/** The advisor profile form: used to apply, and to edit an existing profile. Lengths match the server's validation. */
export function ProfileForm({ initial, submitLabel, onSubmit, note }: {
  initial?: Partial<AdvisorApplication>;
  submitLabel: string;
  onSubmit: (v: AdvisorApplication) => Promise<void>;
  note?: string;
}) {
  const id = useId();
  const [f, setF] = useState({
    name: initial?.name ?? "", institution: initial?.institution ?? "", institutionFull: initial?.institutionFull ?? "", designation: initial?.designation ?? "",
    location: initial?.location ?? "", specialization: initial?.specialization ?? "", specializations: (initial?.specializations ?? []).join(", "),
    researchAreas: (initial?.researchAreas ?? []).join(", "), expertise: initial?.expertise ?? "", about: initial?.about ?? "", years: initial?.yearsExperience != null ? String(initial.yearsExperience) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const years = f.years.trim() === "" ? undefined : Number(f.years);
    if (years !== undefined && (!Number.isInteger(years) || years < 0 || years > 70)) return setError("Years of experience must be a whole number from 0 to 70.");
    if (f.about.trim().length < 20) return setError("Please write at least a couple of sentences in the About box (20 characters or more).");
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        name: f.name.trim(), institution: f.institution.trim(), institutionFull: f.institutionFull.trim(), designation: f.designation.trim(), location: f.location.trim(),
        specialization: f.specialization.trim(), specializations: csv(f.specializations), researchAreas: csv(f.researchAreas), expertise: f.expertise.trim(), about: f.about.trim(), yearsExperience: years,
      });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adv-form" onSubmit={submit}>
      {note && <p className="adv-about">{note}</p>}
      <div className="adv-grid2">
        <Field id={`${id}-n`} label="Full name"><input id={`${id}-n`} className="input" required minLength={2} maxLength={120} value={f.name} onChange={set("name")} /></Field>
        <Field id={`${id}-d`} label="Designation" hint="e.g. Professor"><input id={`${id}-d`} className="input" required minLength={2} maxLength={120} value={f.designation} onChange={set("designation")} /></Field>
        <Field id={`${id}-i`} label="Institution" hint="short name"><input id={`${id}-i`} className="input" required minLength={2} maxLength={160} value={f.institution} onChange={set("institution")} /></Field>
        <Field id={`${id}-if`} label="Institution, full name"><input id={`${id}-if`} className="input" required minLength={2} maxLength={200} value={f.institutionFull} onChange={set("institutionFull")} /></Field>
        <Field id={`${id}-l`} label="Location"><input id={`${id}-l`} className="input" required minLength={2} maxLength={120} value={f.location} onChange={set("location")} /></Field>
        <Field id={`${id}-y`} label="Years of experience"><input id={`${id}-y`} className="input" inputMode="numeric" value={f.years} onChange={set("years")} /></Field>
        <Field id={`${id}-s`} label="Main specialization"><input id={`${id}-s`} className="input" required minLength={2} maxLength={120} value={f.specialization} onChange={set("specialization")} /></Field>
        <Field id={`${id}-ss`} label="All specializations" hint="comma-separated"><input id={`${id}-ss`} className="input" value={f.specializations} onChange={set("specializations")} /></Field>
      </div>
      <Field id={`${id}-r`} label="Research areas" hint="comma-separated"><input id={`${id}-r`} className="input" value={f.researchAreas} onChange={set("researchAreas")} /></Field>
      <Field id={`${id}-e`} label="Expertise, in one line"><input id={`${id}-e`} className="input" required minLength={2} maxLength={300} value={f.expertise} onChange={set("expertise")} /></Field>
      <Field id={`${id}-a`} label="About you"><textarea id={`${id}-a`} className="textarea" required minLength={20} maxLength={3000} value={f.about} onChange={set("about")} /></Field>
      {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

type Window = { weekday: number; startTime: string; endTime: string };

/** The weekly hours (several windows per day) and time off. Hours are Riyadh time. Changing hours never cancels existing bookings. */
export function AvailabilityEditor({ value, onSaveWindows, onAddTimeOff, onRemoveTimeOff, onChanged }: {
  value: AvailabilityState;
  onSaveWindows: (w: Window[]) => Promise<AvailabilityState>;
  onAddTimeOff?: (b: { date: string; startTime?: string; endTime?: string; reason?: string }) => Promise<AvailabilityState>;
  onRemoveTimeOff?: (id: string) => Promise<AvailabilityState>;
  onChanged: (v: AvailabilityState) => void;
}) {
  const toast = useToast();
  const [windows, setWindows] = useState<Window[]>(value.windows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })));
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState({ date: "", startTime: "", endTime: "", reason: "" });
  const dirty = JSON.stringify(windows) !== JSON.stringify(value.windows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })));

  const change = (i: number, patch: Partial<Window>) => setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const run = async (fn: () => Promise<AvailabilityState>, done: string) => {
    setBusy(true);
    try { const v = await fn(); onChanged(v); toast(done); return v; } catch (e) { toast(errText(e)); return null; } finally { setBusy(false); }
  };

  async function save() {
    const v = await run(() => onSaveWindows([...windows].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))), "Hours saved");
    if (v) setWindows(v.windows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })));
  }

  return (
    <div className="adv-avail-editor">
      <p className="adv-about">Times are Riyadh time (UTC+3). People can book a consultation only if it fits entirely inside one of these windows, on a 30-minute grid. Existing bookings are never cancelled by changing your hours.</p>
      <div className="adv-week-edit">
        {WEEKDAY_NAMES.map((name, day) => {
          const rows = windows.map((w, i) => ({ w, i })).filter((x) => x.w.weekday === day);
          return (
            <div key={name} className="adv-week-row">
              <div className="adv-week-day">{name}</div>
              <div className="adv-week-wins">
                {rows.length === 0 && <span className="muted small">Not available</span>}
                {rows.map(({ w, i }) => (
                  <div key={i} className="adv-win">
                    <input type="time" step={1800} aria-label={`${name} window ${i + 1} start`} className="input" value={w.startTime} onChange={(e) => change(i, { startTime: e.target.value })} />
                    <span aria-hidden="true">–</span>
                    <input type="time" step={1800} aria-label={`${name} window ${i + 1} end`} className="input" value={w.endTime} onChange={(e) => change(i, { endTime: e.target.value })} />
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove this ${name} window`} onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setWindows((ws) => [...ws, { weekday: day, startTime: "09:00", endTime: "12:00" }])}>+ Add window</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="adv-actions mt-16">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save hours"}</button>
        {dirty && <button type="button" className="btn btn-ghost" onClick={() => setWindows(value.windows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })))}>Discard changes</button>}
      </div>

      <h3 className="adv-sec-sub">Time off</h3>
      {value.timeOff.length === 0 ? <p className="adv-empty-line">No time off is scheduled.</p> : (
        <ul className="adv-timeoff">
          {value.timeOff.map((t) => (
            <li key={t.id}>
              <span><b>{t.date}</b> {t.startTime ? `${formatWallClock(t.startTime)} – ${formatWallClock(t.endTime!)}` : "whole day"}{t.reason ? ` · ${t.reason}` : ""}</span>
              {onRemoveTimeOff && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => onRemoveTimeOff(t.id), "Time off removed")}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {onAddTimeOff && (
        <form className="adv-timeoff-form" onSubmit={async (e) => {
          e.preventDefault();
          const v = await run(() => onAddTimeOff({ date: off.date, startTime: off.startTime || undefined, endTime: off.endTime || undefined, reason: off.reason.trim() || undefined }), "Time off added");
          if (v) setOff({ date: "", startTime: "", endTime: "", reason: "" });
        }}>
          <input type="date" aria-label="Date" className="input" required value={off.date} onChange={(e) => setOff({ ...off, date: e.target.value })} />
          <input type="time" step={1800} aria-label="From (leave empty for the whole day)" className="input" value={off.startTime} onChange={(e) => setOff({ ...off, startTime: e.target.value })} />
          <input type="time" step={1800} aria-label="Until" className="input" value={off.endTime} onChange={(e) => setOff({ ...off, endTime: e.target.value })} />
          <input type="text" aria-label="Reason" placeholder="Reason (optional)" maxLength={200} className="input" value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} />
          <button type="submit" className="btn btn-outline" disabled={busy || !off.date}>Add time off</button>
        </form>
      )}
    </div>
  );
}

/** The consultation services: add, edit, switch off and on. Services are deactivated, never deleted, so past bookings keep theirs. */
export function ServicesEditor({ services, onCreate, onUpdate, onChanged }: {
  services: ServiceRow[];
  onCreate: (b: ServiceInput) => Promise<ServiceRow>;
  onUpdate: (id: string, b: Partial<ServiceInput> & { active?: boolean }) => Promise<ServiceRow>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const blank: ServiceInput = { typeId: "specialist", name: "", description: "", minutes: 30 };
  const [draft, setDraft] = useState<ServiceInput>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<ServiceInput>(blank);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast(done); onChanged(); return true; } catch (e) { toast(errText(e)); return false; } finally { setBusy(false); }
  }

  const form = (v: ServiceInput, set: (v: ServiceInput) => void, idp: string) => (
    <div className="adv-grid2">
      <Field id={`${idp}-n`} label="Name"><input id={`${idp}-n`} className="input" required minLength={2} maxLength={120} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} /></Field>
      <Field id={`${idp}-t`} label="Type">
        <select id={`${idp}-t`} className="select" value={v.typeId} onChange={(e) => set({ ...v, typeId: e.target.value })}>
          {CONSULTATION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Field>
      <Field id={`${idp}-m`} label="Length" hint="minutes, 15–240"><input id={`${idp}-m`} className="input" type="number" min={15} max={240} step={15} required value={v.minutes} onChange={(e) => set({ ...v, minutes: Number(e.target.value) })} /></Field>
      <Field id={`${idp}-d`} label="Description"><input id={`${idp}-d`} className="input" required minLength={2} maxLength={400} value={v.description} onChange={(e) => set({ ...v, description: e.target.value })} /></Field>
    </div>
  );

  return (
    <div>
      <ul className="adv-services">
        {services.map((s) => (
          <li key={s.id} className={`adv-service${s.active ? "" : " is-off"}`}>
            {editing === s.id ? (
              <form className="adv-svc-form" onSubmit={async (e) => { e.preventDefault(); if (await act(() => onUpdate(s.id, edit), "Service updated")) setEditing(null); }}>
                {form(edit, setEdit, `e-${s.id}`)}
                <div className="adv-actions"><button className="btn btn-primary" disabled={busy}>Save</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button></div>
              </form>
            ) : (
              <>
                <div className="adv-service-body">
                  <b>{s.name}{!s.active && <span className="badge adv-badge-muted ml-8"> Off</span>}</b>
                  <p>{s.description}</p>
                  <span className="adv-service-meta"><RuwadIcon name="clock" size={13} /> {s.minutes} minutes · {CONSULTATION_TYPES.find((t) => t.id === s.typeId)?.label ?? s.typeId}</span>
                </div>
                <div className="adv-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditing(s.id); setEdit({ typeId: s.typeId, name: s.name, description: s.description, minutes: s.minutes }); }}>Edit</button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(() => onUpdate(s.id, { active: !s.active }), s.active ? "Service switched off" : "Service switched on")}>{s.active ? "Switch off" : "Switch on"}</button>
                </div>
              </>
            )}
          </li>
        ))}
        {services.length === 0 && <li className="adv-empty-line">No services yet. Add one so people can book you.</li>}
      </ul>
      <h3 className="adv-sec-sub">Add a service</h3>
      <form className="adv-svc-form" onSubmit={async (e) => { e.preventDefault(); if (await act(() => onCreate(draft), "Service added")) setDraft(blank); }}>
        {form(draft, setDraft, "new")}
        <button className="btn btn-primary" disabled={busy}>Add service</button>
      </form>
    </div>
  );
}
