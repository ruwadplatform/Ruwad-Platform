"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { fetchMeetingStatus, resolveOutcome } from "@/lib/api/advisory";
import type { AttendanceSummary, BookingView, ManualOutcome } from "./advisory-types";
import { OUTCOME_LABEL, errText, formatWhen, outcomeLabel } from "./booking-format";
import { useAsync } from "./use-async";

const CHOICES: ManualOutcome[] = ["ATTENDED_BOTH", "FOUNDER_NO_SHOW", "ADVISOR_NO_SHOW", "BOTH_NO_SHOW"];

/** Record what happened at a consultation that has ended. The system's suggestion (from attendance) is preselected when it is one of the choices; a
 * person always confirms. Saving completes the consultation with that outcome. */
export function ResolveOutcomeModal({ booking, onDone }: { booking: BookingView; onDone: () => void }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const suggested = booking.attendanceOutcome && (CHOICES as string[]).includes(booking.attendanceOutcome) ? (booking.attendanceOutcome as ManualOutcome) : "ATTENDED_BOTH";
  const [outcome, setOutcome] = useState<ManualOutcome>(suggested);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await resolveOutcome(booking.id, outcome, note.trim() || undefined);
      toast("Outcome recorded");
      closeModal();
      onDone();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">What happened at this consultation?</h3>
      <p className="muted small mt-8">{booking.serviceName} with {booking.startupName}. {booking.attendanceOutcome ? `Attendance suggests: ${outcomeLabel(booking.attendanceOutcome)}.` : "No attendance was recorded."} Please confirm. This completes the consultation.</p>
      <fieldset className="adv-outcomes">
        <legend className="adv-note-label">Outcome</legend>
        {CHOICES.map((c) => (
          <label key={c} className="adv-outcome">
            <input type="radio" name="outcome" checked={outcome === c} onChange={() => setOutcome(c)} />
            <span>{OUTCOME_LABEL[c]}{c === booking.attendanceOutcome ? <span className="badge adv-badge-info ml-8"> Suggested</span> : null}</span>
          </label>
        ))}
      </fieldset>
      <label className="adv-note-label" htmlFor="adv-outcome-note">Note (optional)</label>
      <textarea id="adv-outcome-note" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
      <div className="flex gap-8 mt-16">
        <button type="button" className="btn btn-outline" onClick={closeModal} disabled={busy}>Back</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Record outcome"}</button>
      </div>
    </div>
  );
}

function stay(a: AttendanceSummary["advisor"]): string {
  if (!a.hasRecord) return "Not recorded";
  const joined = a.firstJoinedAt ? formatWhen(a.firstJoinedAt) : "?";
  const left = a.present ? "still in the room" : a.lastLeftAt ? `left ${formatWhen(a.lastLeftAt)}` : "no leave recorded";
  return `${a.minutes} min · joined ${joined}, ${left}`;
}

/** Who was in the meeting room, and (for the advisor and administrators) the prompt to record what happened when a consultation needs review. */
export function AttendancePanel({ booking, viewerRole, onChanged }: { booking: BookingView; viewerRole: "FOUNDER" | "ADVISOR" | "ADMIN"; onChanged: () => void }) {
  const { openModal } = useModal();
  const res = useAsync(`attendance|${booking.id}|${booking.status}`, () => fetchMeetingStatus(booking.id));
  const a = res.data?.attendance;
  const ended = new Date(booking.endsAt) <= new Date();
  const canResolve = (viewerRole === "ADVISOR" || viewerRole === "ADMIN") && booking.status === "CONFIRMED" && ended;
  if (!a && !booking.needsReview && !booking.attendanceOutcome) return null;
  return (
    <section className="panel panel-pad adv-attendance" aria-label="Attendance">
      <h2 className="adv-sec-title">Attendance</h2>
      {a && (
        <dl className="adv-facts">
          <div><dt>Advisor</dt><dd>{stay(a.advisor)}</dd></div>
          <div><dt>Startup</dt><dd>{stay(a.founder)}</dd></div>
          <div><dt>Together in the room</dt><dd>{a.hasData ? `${a.overlapMinutes} min` : "Not recorded"}</dd></div>
          {booking.attendanceOutcome && <div><dt>Outcome</dt><dd>{outcomeLabel(booking.attendanceOutcome)}</dd></div>}
        </dl>
      )}
      {booking.needsReview && (
        <p className="adv-review-note mt-16"><RuwadIcon name="info" size={14} /> {viewerRole === "FOUNDER" ? "This consultation has ended. The advisor will confirm what happened." : "This consultation has ended and needs someone to confirm what happened."}</p>
      )}
      {canResolve && <div className="adv-actions mt-16"><button type="button" className="btn btn-primary" onClick={() => openModal(<ResolveOutcomeModal booking={booking} onDone={onChanged} />)}>Record the outcome</button></div>}
    </section>
  );
}
