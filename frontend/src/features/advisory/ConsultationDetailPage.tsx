"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { useSession } from "@/hooks/use-store";
import { acceptReschedule, adminCancelBooking, approveBooking, cancelBooking, completeBooking, declineReschedule, fetchBooking, rejectBooking, withdrawReschedule } from "@/lib/api/advisory";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import { AttendancePanel } from "./AttendanceParts";
import { MeetingCard } from "./MeetingPage";
import { NoteModal, RescheduleModal } from "./booking-modals";
import { BookingStatusBadge, errText, expiryLine, formatWhen, localZoneIfDifferent, outcomeLabel } from "./booking-format";
import type { BookingDetail, BookingHistoryEvent } from "./advisory-types";
import { useAsync } from "./use-async";

const ACTOR: Record<string, string> = { FOUNDER: "Startup", ADVISOR: "Advisor", ADMIN: "Administrator", SYSTEM: "System" };

function describeEvent(e: BookingHistoryEvent): string {
  const d = (e.details ?? {}) as Record<string, string | undefined>;
  const fmt = (iso?: string) => (iso ? formatWhen(iso) : "");
  switch (e.type) {
    case "CREATED": return "Request sent";
    case "CONFIRMED": return "Approved by the advisor";
    case "REJECTED": return d.note ? `Declined: ${d.note}` : "Declined by the advisor";
    case "CANCELLED": return d.note ? `Cancelled: ${d.note}` : "Cancelled";
    case "COMPLETED": return "Marked as completed";
    case "NEEDS_REVIEW": return "The consultation ended: waiting for someone to confirm what happened";
    case "OUTCOME_RESOLVED": return `Outcome recorded: ${outcomeLabel(d.outcome) ?? "recorded"}${d.note ? ` (“${d.note}”)` : ""}`;
    case "SUGGESTION_UPDATED": return `Late attendance data arrived: the suggested outcome is now "${outcomeLabel(d.to) ?? "updated"}"`;
    case "JOIN_REQUESTED": return "Joined the meeting";
    case "EXPIRED": return "Expired: nobody answered in time, so the time was released";
    case "RESCHEDULE_EXPIRED": return "The proposed new time expired unanswered; the original time is unchanged";
    case "RESCHEDULE_PROPOSED": return `New time proposed: ${fmt(d.to)}${d.note ? ` (“${d.note}”)` : ""}`;
    case "RESCHEDULE_ACCEPTED": return d.to ? `New time accepted: ${fmt(d.to)}` : "New time accepted";
    case "RESCHEDULE_DECLINED": return d.note ? `Proposed time declined: ${d.note}` : "Proposed time declined";
    case "RESCHEDULE_WITHDRAWN": return "Proposed time withdrawn";
    case "NOTIFICATION": return d.skipped ? "Email not sent (demonstration booking)" : "Email notification recorded (mock mode: nothing was sent)";
    default: return e.type;
  }
}

/** One consultation in full: the facts, any proposed new time, the actions the viewer is allowed (the server decides which), and the history.
 * Used by the startup side, the advisor, and administrators; the buttons shown follow `detail.actions`, and the server re-checks every action. */
export function ConsultationDetailPage({ id }: { id: string }) {
  const { loggedIn, hydrated } = useSession();
  const [tick, setTick] = useState(0);
  const res = useAsync<BookingDetail>(loggedIn ? `booking|${id}|${tick}` : null, () => fetchBooking(id));
  const reload = () => setTick((t) => t + 1);

  if (!hydrated) return <LoadingState />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to see this consultation" body="Consultations are private to the startup and the advisor. Sign in to continue." />;
  if (res.loading) return <LoadingState title="Loading consultation…" />;
  if (res.error || !res.data) {
    const missing = /not found/i.test(res.error ?? "");
    return missing
      ? <EmptyState icon="search" title="Consultation not found" body="It may not exist, or it may belong to someone else." action={<Link className="btn btn-outline" href="/workspace/consultations">Back to My Consultations</Link>} />
      : <ErrorState title="Couldn't load this consultation" body={res.error ?? "Please try again in a moment."} />;
  }
  return <Detail detail={res.data} reload={reload} />;
}

function Detail({ detail, reload }: { detail: BookingDetail; reload: () => void }) {
  const { booking: b, viewerRole, actions, history } = detail;
  const { openModal } = useModal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const localTz = localZoneIfDifferent(new Date(b.startsAt));
  const pending = b.pendingReschedule;
  const otherParty = viewerRole === "ADVISOR" ? b.startupName : b.advisor?.name ?? "the advisor";

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast(done); reload(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  const cancel = () => openModal(
    <NoteModal title="Cancel this consultation?" body={`${otherParty === b.startupName ? b.startupName : otherParty} will be told it was cancelled. This can't be undone.`} label="Reason" confirmLabel="Cancel consultation" danger
      onSubmit={async (reason) => { await (viewerRole === "ADMIN" ? adminCancelBooking(b.id, reason) : cancelBooking(b.id, reason)); toast("Consultation cancelled"); reload(); }} />,
  );
  const reject = () => openModal(
    <NoteModal title="Decline this request?" body="The time is released and the startup is told you couldn't accept it." label="Note to the startup" confirmLabel="Decline request" danger
      onSubmit={async (note) => { await rejectBooking(b.id, note); toast("Request declined"); reload(); }} />,
  );
  const decline = () => openModal(
    <NoteModal title="Decline the proposed time?" body="Your consultation stays booked at its current time." label="Note" confirmLabel="Decline proposal"
      onSubmit={async (note) => { await declineReschedule(b.id, note); toast("Proposal declined"); reload(); }} />,
  );
  const propose = () => openModal(<RescheduleModal booking={b} otherParty={otherParty} onProposed={() => { toast("New time proposed. It stays booked as it is until they accept."); reload(); }} />, "wide");

  const facts: [string, ReactNode][] = [
    ["Reference", b.reference],
    ["Advisor", b.advisor ? <>{b.advisor.name}{b.isDemo && <> <span className="adv-demo">Demo profile</span></>}<div className="muted small">{b.advisor.institution}</div></> : "—"],
    ["Startup", b.startupName],
    ["Consultation", b.serviceName],
    ["When", <>{formatWhen(b.startsAt)} <span className="muted small">Riyadh (UTC+3)</span>{localTz && <div className="muted small">{formatWhen(b.startsAt, localTz)} your time ({localTz.replace(/_/g, " ")})</div>}</>],
    ["Duration", `${b.minutes} minutes`],
    ["Format", "Online via RUWĀD"],
    ["Description", b.description || "Not provided"],
  ];
  if (expiryLine(b)) facts.push(["Expires if unanswered", expiryLine(b)!]);
  if (b.decisionNote) facts.push(["Advisor's note", b.decisionNote]);
  if (b.cancelReason) facts.push(["Cancellation reason", `${b.cancelReason}${b.cancelledBy ? ` (by ${ACTOR[b.cancelledBy]?.toLowerCase() ?? b.cancelledBy.toLowerCase()})` : ""}`]);

  return (
    <div className="advisory-page adv-detail">
      <Breadcrumbs items={[{ label: "Workspace" }, { label: viewerRole === "ADVISOR" ? "Advisor Dashboard" : "My Consultations", href: viewerRole === "ADVISOR" ? "/workspace/advisor" : "/workspace/consultations" }, { label: b.reference }]} />
      <section className="adv-hero panel">
        <div className="adv-hero-text">
          <h1 className="adv-profile-name">{b.serviceName}</h1>
          <p className="muted small">{viewerRole === "ADVISOR" ? `Requested by ${b.startupName}` : `With ${b.advisor?.name ?? "your advisor"}`}</p>
          <div className="mt-8"><BookingStatusBadge booking={b} /></div>
        </div>
      </section>

      {pending && b.status === "CONFIRMED" && (
        <section className="panel panel-pad adv-proposal" aria-label="Proposed new time">
          <h2 className="adv-sec-title">{pending.proposedBy === viewerRole ? "You proposed a new time" : `${pending.proposedBy === "ADVISOR" ? b.advisor?.name ?? "The advisor" : b.startupName} proposed a new time`}</h2>
          <p className="adv-about">{formatWhen(pending.startsAt)} <span className="muted small">Riyadh (UTC+3)</span></p>
          <p className="muted small mt-8">{pending.expiresAt ? "If nobody answers by " + formatWhen(pending.expiresAt) + " the proposal expires. " : ""}Your consultation stays booked for {formatWhen(b.startsAt)} until the new time is accepted. Only {pending.proposedBy === "FOUNDER" ? "the advisor" : "the startup"} can accept it.</p>
          <div className="adv-actions mt-16">
            {actions.acceptReschedule && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => acceptReschedule(b.id), "New time accepted")}>Accept new time</button>}
            {actions.declineReschedule && <button type="button" className="btn btn-outline" disabled={busy} onClick={decline}>Decline</button>}
            {actions.withdrawReschedule && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => withdrawReschedule(b.id), "Proposal withdrawn")}>Withdraw proposal</button>}
            {!actions.acceptReschedule && !actions.withdrawReschedule && <span className="muted small">Waiting for {pending.proposedBy === "FOUNDER" ? "the advisor" : "the startup"} to answer.</span>}
          </div>
        </section>
      )}

      {b.status === "CONFIRMED" && <MeetingCard bookingId={b.id} />}
      {(b.status === "CONFIRMED" || b.status === "COMPLETED") && <AttendancePanel booking={b} viewerRole={viewerRole} onChanged={reload} />}

      <section className="panel panel-pad">
        <dl className="adv-facts">
          {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="adv-actions mt-16">
          {actions.approve && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => approveBooking(b.id), "Request approved")}>Approve request</button>}
          {actions.reject && <button type="button" className="btn btn-outline" disabled={busy} onClick={reject}>Decline request</button>}
          {actions.complete && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => completeBooking(b.id), "Marked as completed")}>Mark as completed</button>}
          {actions.proposeReschedule && <button type="button" className="btn btn-outline" disabled={busy} onClick={propose}><RuwadIcon name="calendar" size={14} /> Propose a new time</button>}
          {actions.cancel && <button type="button" className="btn btn-outline adv-danger" disabled={busy} onClick={cancel}>Cancel consultation</button>}
          <Link className="btn btn-ghost" href={viewerRole === "ADVISOR" ? "/workspace/advisor" : viewerRole === "ADMIN" ? "/admin/advisory" : "/workspace/consultations"}>Back</Link>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="adv-sec-title">History</h2>
        <ol className="adv-history">
          {history.map((e) => (
            <li key={e.id} className={e.type === "NOTIFICATION" ? "is-quiet" : ""}>
              <span className="adv-history-when">{formatWhen(e.createdAt)}</span>
              <span className="adv-history-what">{describeEvent(e)}</span>
              <span className="adv-history-who">{ACTOR[e.actorRole] ?? e.actorRole}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
