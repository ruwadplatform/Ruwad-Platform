"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { useSession } from "@/hooks/use-store";
import { fetchBooking, fetchMeetingStatus, joinMeeting } from "@/lib/api/advisory";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import { DailyRoom, SimulatedRoom } from "./MeetingRooms";
import type { BookingDetail, JoinInfo, MeetingStatus } from "./advisory-types";
import { errText, formatWhen } from "./booking-format";
import { useAsync } from "./use-async";

/** A short, human "in 5 minutes" / "in 2 hours" for a future instant. */
export function untilText(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60_000));
  if (mins < 1) return "any moment";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}${mins % 60 && hours < 6 ? ` ${mins % 60} min` : ""}`;
  return `${Math.round(hours / 24)} days`;
}

/** Re-renders (and refetches a keyed request) on an interval, so countdowns and the "can I join now?" answer stay current without a reload. */
function useTicker(everyMs: number): { now: Date; tick: number } {
  const [state, setState] = useState(() => ({ now: new Date(), tick: 0 }));
  useEffect(() => {
    const t = setInterval(() => setState((s) => ({ now: new Date(), tick: s.tick + 1 })), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return state;
}

function statusLine(s: MeetingStatus, now: Date): string {
  switch (s.state) {
    case "NOT_CONFIRMED": return "There is no meeting for this consultation: it isn't confirmed.";
    case "NOT_OPEN": return `The meeting opens in ${untilText(s.opensAt, now)}, at ${formatWhen(s.opensAt)} (Riyadh time).`;
    case "OPEN": return s.canJoin ? "The meeting is open. You can join now." : "The meeting is open.";
    case "ENDED": return "This meeting has ended.";
  }
}

/** The "Online meeting" card on a consultation: when it opens, and a Join button that works only when joining is actually possible. */
export function MeetingCard({ bookingId }: { bookingId: string }) {
  const { now, tick } = useTicker(20_000);
  const res = useAsync(`meeting|${bookingId}|${tick}`, () => fetchMeetingStatus(bookingId));
  const s = res.data;
  return (
    <section className="panel panel-pad adv-meeting-card" aria-label="Online meeting">
      <div className="adv-meeting-head">
        <h2 className="adv-sec-title"><RuwadIcon name="calendar" size={16} /> Online meeting</h2>
        {s && <span className={`badge ${s.state === "OPEN" ? "adv-badge-good" : "adv-badge-muted"}`}>{s.state === "OPEN" ? "Open" : s.state === "NOT_OPEN" ? "Not open yet" : s.state === "ENDED" ? "Ended" : "No meeting"}</span>}
      </div>
      {res.error && !s ? <p className="adv-empty-line">Couldn&apos;t check the meeting. {res.error}</p>
        : !s ? <p className="adv-empty-line">Checking the meeting…</p>
        : (
          <>
            <p className="adv-about">{statusLine(s, now)}</p>
            {s.mode === "simulated" && <p className="muted small mt-8">This consultation uses a simulated room (a demonstration; no real video).</p>}
            {!s.available && <p className="adv-review-note mt-8"><RuwadIcon name="info" size={14} /> Video meetings aren&apos;t set up yet, so this meeting can&apos;t be joined.</p>}
            {s.state !== "NOT_CONFIRMED" && <p className="adv-meeting-notice"><RuwadIcon name="lock" size={13} /> {s.notice}</p>}
            <div className="adv-actions mt-16">
              {s.canJoin
                ? <Link className="btn btn-primary" href={`/workspace/consultations/${bookingId}/meeting`}>Join meeting</Link>
                : <button type="button" className="btn btn-primary" disabled>{s.state === "NOT_OPEN" ? `Opens in ${untilText(s.opensAt, now)}` : s.state === "ENDED" ? "Meeting ended" : "Join meeting"}</button>}
              {!s.canJoin && s.available && s.state !== "NOT_CONFIRMED" && <span className="muted small">Only the advisor and the startup&apos;s owner or admin can join.</span>}
            </div>
          </>
        )}
    </section>
  );
}

/** The meeting itself: a short lobby (what to expect, the not-recorded notice), then the room. Leaving returns to the lobby, where the person can
 * rejoin for as long as the window is open. */
export function MeetingPage({ id }: { id: string }) {
  const { loggedIn, hydrated } = useSession();
  const { now, tick } = useTicker(20_000);
  const detail = useAsync<BookingDetail>(loggedIn ? `mtg-detail|${id}` : null, () => fetchBooking(id));
  const [join, setJoin] = useState<JoinInfo | null>(null);
  // The status is refreshed only in the lobby. While someone is IN the room nothing may change underneath them: a refetch swaps `data` for "loading", the
  // full-page loading screen below would replace the live call, the call frame would be destroyed and rebuilt, and the person would be asked to join again.
  const status = useAsync(loggedIn && !join ? `mtg-status|${id}|${tick}` : null, () => fetchMeetingStatus(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!hydrated) return <LoadingState />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to join your meeting" body="Meetings are private to the advisor and the startup. Sign in to continue." />;
  if (detail.loading || (status.loading && !status.data)) return <LoadingState title="Loading your meeting…" />;
  if (detail.error || !detail.data) {
    return /not found/i.test(detail.error ?? "")
      ? <EmptyState icon="search" title="Consultation not found" body="It may not exist, or it may belong to someone else." action={<Link className="btn btn-outline" href="/workspace/consultations">Back to My Consultations</Link>} />
      : <ErrorState title="Couldn't load this meeting" body={detail.error ?? "Please try again in a moment."} />;
  }

  const { booking: b, viewerRole } = detail.data;
  const s = status.data;
  const otherParty = viewerRole === "ADVISOR" ? b.startupName : b.advisor?.name ?? "Advisor";
  const backHref = `/workspace/consultations/${id}`;

  async function enter() {
    setBusy(true);
    setError("");
    try { setJoin(await joinMeeting(id)); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="advisory-page adv-meeting">
      <Breadcrumbs items={[{ label: "Workspace" }, { label: viewerRole === "ADVISOR" ? "Advisor Dashboard" : "My Consultations", href: viewerRole === "ADVISOR" ? "/workspace/advisor" : "/workspace/consultations" }, { label: b.reference, href: backHref }, { label: "Meeting" }]} />
      <section className="adv-hero panel">
        <div className="adv-hero-text">
          <h1 className="adv-profile-name">{b.serviceName}</h1>
          <p className="muted small">{viewerRole === "ADVISOR" ? `With ${b.startupName}` : `With ${b.advisor?.name ?? "your advisor"}`} · {formatWhen(b.startsAt)} · {b.minutes} minutes · Riyadh time</p>
        </div>
      </section>

      {join ? (
        <>
          {join.mode === "daily" ? <DailyRoom join={join} onLeave={() => setJoin(null)} /> : <SimulatedRoom bookingId={id} join={join} otherParty={otherParty} onLeave={() => setJoin(null)} />}
          <p className="adv-meeting-notice mt-8"><RuwadIcon name="lock" size={13} /> {join.notice} The meeting closes at {formatWhen(join.closesAt)}.</p>
        </>
      ) : (
        <section className="panel panel-pad adv-lobby">
          <h2 className="adv-sec-title">Ready to join?</h2>
          {s ? <p className="adv-about">{statusLine(s, now)}</p> : <p className="adv-about">Checking the meeting…</p>}
          <ul className="adv-lobby-list">
            <li>Join from a quiet place with a working camera and microphone. Your browser will ask for permission.</li>
            <li>You can share your screen and chat during the meeting.</li>
            <li><b>{s?.notice ?? "This meeting is not recorded. Please do not share patient-identifiable information."}</b></li>
          </ul>
          {s?.mode === "simulated" && <p className="adv-review-note"><RuwadIcon name="info" size={14} /> This is a simulated room (a demonstration): nothing is connected and no camera or microphone is used.</p>}
          {s && !s.available && <p className="adv-review-note adv-review-error" role="alert">Video meetings aren&apos;t set up yet, so this meeting can&apos;t be joined.</p>}
          {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
          <div className="adv-actions mt-16">
            <button type="button" className="btn btn-primary btn-lg" onClick={enter} disabled={busy || !s?.canJoin}>{busy ? "Joining…" : s?.state === "NOT_OPEN" ? `Opens in ${untilText(s.opensAt, now)}` : s?.state === "ENDED" ? "Meeting ended" : "Join meeting"}</button>
            <Link className="btn btn-ghost" href={backHref}>Back to the consultation</Link>
          </div>
        </section>
      )}
    </div>
  );
}
