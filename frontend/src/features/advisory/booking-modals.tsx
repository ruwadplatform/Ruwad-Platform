"use client";

import { useMemo, useState } from "react";
import { useModal } from "@/components/shell/ModalProvider";
import { fetchRescheduleDates, fetchRescheduleSlots, proposeReschedule } from "@/lib/api/advisory";
import { BookingCalendar, type CalendarMonth } from "./BookingCalendar";
import { RIYADH_TZ, formatClock, formatDateUS, offsetLabel, parseYmd, riyadhDate } from "./advisory-time";
import type { BookingView } from "./advisory-types";
import { errText, formatWhen, localZoneIfDifferent } from "./booking-format";
import { useAsync } from "./use-async";

/** A small "give a reason / add a note" confirmation, for cancel, decline and similar. The note is optional unless `required`. */
export function NoteModal({ title, body, label, confirmLabel, danger, required, minLength, onSubmit }: {
  title: string;
  body: string;
  label: string;
  confirmLabel: string;
  danger?: boolean;
  required?: boolean;
  /** With `required`: the shortest note that counts as a real reason. */
  minLength?: number;
  onSubmit: (note: string) => Promise<void>;
}) {
  const { closeModal } = useModal();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSubmit(note.trim());
      closeModal();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">{title}</h3>
      <p className="muted small mt-8">{body}</p>
      <label className="adv-note-label" htmlFor="adv-note-input">{label}{required ? "" : " (optional)"}</label>
      <textarea id="adv-note-input" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="char-counter">{required && minLength && note.trim().length < minLength ? `At least ${minLength} characters · ` : ""}{note.length}/500</div>
      {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
      <div className="flex gap-8 mt-16">
        <button type="button" className="btn btn-outline" onClick={closeModal} disabled={busy}>Back</button>
        <button
          type="button"
          className="btn btn-primary"
          style={danger ? { background: "var(--crit)", borderColor: "var(--crit)" } : undefined}
          onClick={submit}
          disabled={busy || (required === true && note.trim().length < (minLength ?? 1))}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** Propose a new time for a CONFIRMED booking. This only PROPOSES: the booking stays exactly as it is, at its current time, until the other side
 * accepts, and nothing is confirmed on anyone's behalf. */
export function RescheduleModal({ booking, otherParty, onProposed }: { booking: BookingView; otherParty: string; onProposed: (updated: BookingView) => void }) {
  const { closeModal } = useModal();
  const [now] = useState(() => new Date());
  const today = useMemo(() => riyadhDate(now), [now]);
  const [pickedDate, setPickedDate] = useState("");
  const [pickedStart, setPickedStart] = useState("");
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [tzMode, setTzMode] = useState<"riyadh" | "local">("riyadh");
  const localTz = useMemo(() => localZoneIfDifferent(), []);
  const zone = tzMode === "local" && localTz ? localTz : RIYADH_TZ;

  const datesRes = useAsync(`rdates|${booking.id}|${tick}`, () => fetchRescheduleDates(booking.id));
  const available = useMemo(() => new Set(datesRes.data?.dates ?? []), [datesRes.data]);
  const first = useMemo(() => [...available].sort()[0] ?? "", [available]);
  const dateKey = available.has(pickedDate) ? pickedDate : first;
  const slotsRes = useAsync(dateKey ? `rslots|${booking.id}|${dateKey}|${tick}` : null, () => fetchRescheduleSlots(booking.id, dateKey));
  const slots = (slotsRes.data?.slots ?? []).filter((s) => s.startsAt !== booking.startsAt);
  const shown: CalendarMonth = month ?? (dateKey ? { y: parseYmd(dateKey).y, m: parseYmd(dateKey).m } : { y: today.y, m: today.m });
  const [calOpen, setCalOpen] = useState(false);

  async function submit() {
    if (!pickedStart) return;
    setBusy(true);
    setError("");
    try {
      onProposed(await proposeReschedule(booking.id, pickedStart, note.trim() || undefined));
      closeModal();
    } catch (e) {
      setError(errText(e));
      setPickedStart("");
      setTick((t) => t + 1); // the slot may have just gone: show what is open now
      setBusy(false);
    }
  }

  return (
    <div className="modal-box-pad adv-resched">
      <h3 className="fs-15">Propose a new time</h3>
      <p className="muted small mt-8">
        Your consultation is currently <b>{formatWhen(booking.startsAt)}</b>. It stays booked for that time until {otherParty} accepts the new one. Nothing changes if they don&apos;t.
      </p>

      <div className="adv-bfield mt-16">
        <label htmlFor="adv-resched-date">New date</label>
        <button type="button" id="adv-resched-date" className="adv-datefield" aria-expanded={calOpen} disabled={!first} onClick={() => setCalOpen((o) => !o)}>
          <span>{datesRes.loading ? "Loading dates…" : dateKey ? formatDateUS(parseYmd(dateKey)) : "No dates available"}</span>
        </button>
        {calOpen && <BookingCalendar month={shown} onMonthChange={setMonth} selected={dateKey} available={available} today={today} onSelect={(k) => { setPickedDate(k); setPickedStart(""); setCalOpen(false); }} />}
        {datesRes.error && <p className="adv-review-note adv-review-error" role="alert">{datesRes.error}</p>}
      </div>

      <div className="adv-bfield">
        <div className="adv-slots-head"><b>Available times</b><span className="adv-zone">{zone === RIYADH_TZ ? `Riyadh (${offsetLabel(now, RIYADH_TZ)})` : `${zone.replace(/_/g, " ")} (${offsetLabel(now, zone)})`}</span></div>
        {localTz && (
          <div className="seg-tabs adv-tz" role="group" aria-label="Time zone">
            <button type="button" className={tzMode === "riyadh" ? "active" : ""} aria-pressed={tzMode === "riyadh"} onClick={() => setTzMode("riyadh")}>Riyadh time</button>
            <button type="button" className={tzMode === "local" ? "active" : ""} aria-pressed={tzMode === "local"} onClick={() => setTzMode("local")}>My time zone</button>
          </div>
        )}
        {slotsRes.error ? <p className="adv-noslots adv-error" role="alert">{slotsRes.error}</p>
          : datesRes.loading || slotsRes.loading ? <p className="adv-noslots" role="status">Loading available times…</p>
          : slots.length === 0 ? <p className="adv-noslots" role="status">No other times are available on this date. Please choose another date.</p>
          : (
            <div className="adv-slots" role="group" aria-label="Available times">
              {slots.map((s) => (
                <button key={s.startsAt} type="button" className={`adv-slot${s.startsAt === pickedStart ? " is-selected" : ""}`} aria-pressed={s.startsAt === pickedStart} onClick={() => setPickedStart(s.startsAt)}>
                  {formatClock(new Date(s.startsAt), zone)}
                </button>
              ))}
            </div>
          )}
      </div>

      <div className="adv-bfield">
        <label htmlFor="adv-resched-note">Message to {otherParty} <span className="muted">(optional)</span></label>
        <textarea id="adv-resched-note" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
      <div className="adv-review-actions">
        <button type="button" className="btn btn-outline" onClick={closeModal} disabled={busy}>Back</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !pickedStart}>{busy ? "Sending…" : "Send proposal"}</button>
      </div>
    </div>
  );
}
