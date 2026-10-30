"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { useSession } from "@/hooks/use-store";
import {
  addMyTimeOff, approveBooking, completeBooking, createMyService, fetchAdvisorBookings, fetchMyAdvisorProfile, fetchMyAvailability, fetchMyServices, rejectBooking,
  removeMyTimeOff, saveMyAvailability, updateMyAdvisorProfile, updateMyService,
} from "@/lib/api/advisory";
import { AdvisorApplicationForm, type SubmittedApplication } from "./AdvisorApplicationForm";
import { AvailabilityEditor, ProfileForm, ServicesEditor } from "./AdvisorEditors";
import { SubmittedPanel, usePrefill } from "./BecomeAdvisor";
import { valuesFromApplication } from "./application-form";
import { ApplicationStatusCard } from "./ApplicationStatusCard";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import { ResolveOutcomeModal } from "./AttendanceParts";
import { NoteModal } from "./booking-modals";
import { BookingStatusBadge, errText, expiryLine, formatWhen, outcomeLabel } from "./booking-format";
import type { AvailabilityState, BookingView, MyAdvisorProfile } from "./advisory-types";
import { ADVISOR_BOOKING_NOT_OPEN_NOTE, PENDING_REVIEW_COPY, SUSPENDED_COPY } from "./advisor-notices";
import { useAsync } from "./use-async";
import { useBookingsStatus } from "./use-bookings-status";

type Tab = "requests" | "upcoming" | "review" | "completed" | "availability" | "services" | "profile";
const TABS: { id: Tab; label: string }[] = [
  { id: "requests", label: "Requests" },
  { id: "upcoming", label: "Upcoming" },
  { id: "review", label: "Needs review" },
  { id: "completed", label: "Completed" },
  { id: "availability", label: "Availability" },
  { id: "services", label: "Services" },
  { id: "profile", label: "Profile" },
];

/** Workspace → Advisor Dashboard. Profile-based: anyone signed in can apply; once an administrator approves the profile, the bookings, hours and
 * services appear here. Before that, this shows the application's status. There is no advisor account type. */
export function AdvisorDashboardPage() {
  const { loggedIn, hydrated } = useSession();
  const [tick, setTick] = useState(0);
  const me = useAsync(loggedIn ? `me|${tick}` : null, fetchMyAdvisorProfile);
  const reload = () => setTick((t) => t + 1);

  if (!hydrated) return <LoadingState />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to the Advisor Dashboard" body="Sign in to apply as an advisor or to manage your consultations." />;
  if (me.loading) return <LoadingState title="Loading your advisor profile…" />;
  if (me.error || !me.data) return <ErrorState title="Couldn't load your advisor profile" body={me.error ?? "Please try again in a moment."} />;

  const advisor = me.data.advisor;
  return (
    <div className="advisory-page">
      <Breadcrumbs items={[{ label: "Workspace" }, { label: "Advisor Dashboard" }]} />
      <PageHeader title="Advisor Dashboard" description="Consultation requests, your availability and your services." />
      <div className="mt-16">
        {!advisor ? <Apply onDone={reload} /> : advisor.status === "APPROVED" ? <Dashboard advisor={advisor} reload={reload} /> : <ReviewStatus advisor={advisor} reload={reload} />}
      </div>
    </div>
  );
}

function Apply({ onDone }: { onDone: () => void }) {
  const prefill = usePrefill();
  const [done, setDone] = useState<SubmittedApplication | null>(null);
  if (done) return <section className="panel panel-pad"><SubmittedPanel reference={done.reference} onClose={onDone} onView={onDone} /></section>;
  return (
    <section className="panel panel-pad">
      <h2 className="adv-sec-title">Become an advisor</h2>
      <p className="adv-about">Tell founders who you are and what you can help with. A RUWĀD administrator reviews every application before a profile appears in the directory. Your institution is shown as <i>listed, not verified</i> until an administrator has checked it.</p>
      <div className="mt-16">
        <AdvisorApplicationForm prefill={prefill} onSubmitted={setDone} />
      </div>
    </section>
  );
}

/** Edit & Reapply for a REJECTED application: the form prefilled with what was submitted, with the documents on file listed. */
function Reapply({ advisor, onDone, onCancel }: { advisor: MyAdvisorProfile; onDone: () => void; onCancel: () => void }) {
  const app = advisor.application!;
  const [done, setDone] = useState<SubmittedApplication | null>(null);
  const prefill = useMemo(() => valuesFromApplication(advisor.profile, app.form), [advisor.profile, app.form]);
  if (done) {
    return (
      <section className="panel panel-pad">
        <div className="adv-submitted" role="status">
          <span className="adv-submitted-icon" aria-hidden="true"><RuwadIcon name="check" size={28} /></span>
          <h3 className="adv-sec-title">Application resubmitted</h3>
          <p className="adv-about">Your updated application has been submitted for review. The RUWĀD team will review it again and notify you by email.</p>
          <p className="adv-ref">Reference <b>{done.reference}</b></p>
          <div className="adv-review-actions" style={{ justifyContent: "center" }}><button type="button" className="btn btn-primary" onClick={onDone}>View application status</button></div>
        </div>
      </section>
    );
  }
  return (
    <section className="panel panel-pad">
      <div className="adv-appstatus-head">
        <h2 className="adv-sec-title">Edit &amp; Reapply</h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
      </div>
      {app.rejectionReason && <div className="adv-reason" role="note"><b>Reason from the RUWĀD team</b><p>{app.rejectionReason}</p></div>}
      <p className="adv-about mt-16">Update anything you like, replace your CV or other documents if needed, confirm the declaration and submit it again. Your application stays at the same reference number.</p>
      <div className="mt-16">
        <AdvisorApplicationForm prefill={prefill} reapply={{ documents: app.documents }} onSubmitted={setDone} />
      </div>
    </section>
  );
}

function ReviewStatus({ advisor, reload }: { advisor: MyAdvisorProfile; reload: () => void }) {
  const toast = useToast();
  // Arriving with ?reapply=1 (from the Become an Advisor window) opens the form straight away. This only mounts after the session has loaded, so reading the address here is safe.
  const [reapplying, setReapplying] = useState(() => typeof window !== "undefined" && window.location.search === "?reapply=1" && advisor.application?.canReapply === true);
  if (reapplying && advisor.application?.canReapply) return <Reapply advisor={advisor} onDone={reload} onCancel={() => setReapplying(false)} />;
  const copy = {
    DRAFT: { title: "Your profile is a draft", body: "Finish your profile and submit it for review." },
    PENDING_REVIEW: { title: "Your application is being reviewed", body: PENDING_REVIEW_COPY },
    REJECTED: { title: "Your application wasn't approved", body: "You can update your profile below. Contact RUWĀD if you'd like it looked at again." },
    SUSPENDED: { title: "Your advisor profile is suspended", body: SUSPENDED_COPY },
  }[advisor.status as "DRAFT" | "PENDING_REVIEW" | "REJECTED" | "SUSPENDED"];
  return (
    <>
      <section className="panel panel-pad">
        <h2 className="adv-sec-title">{advisor.application ? "Your advisor application" : copy.title}</h2>
        {advisor.application ? <ApplicationStatusCard application={advisor.application} onReapply={() => setReapplying(true)} /> : <p className="adv-about">{copy.body}</p>}
        {advisor.reviewNotes && (!advisor.application || advisor.status === "SUSPENDED") && <p className="adv-review-note mt-16"><RuwadIcon name="info" size={14} /> Reviewer&apos;s note: {advisor.reviewNotes}</p>}
      </section>
      {(!advisor.application || advisor.status === "PENDING_REVIEW" || advisor.status === "DRAFT") && (
        <section className="panel panel-pad mt-16">
          <h3 className="adv-sec-sub" style={{ marginTop: 0 }}>Your profile</h3>
          <ProfileForm
            submitLabel="Save profile"
            initial={{ ...advisor.profile, yearsExperience: advisor.profile.yearsExperience ?? undefined }}
            onSubmit={async (v) => { await updateMyAdvisorProfile(v); toast("Profile saved"); reload(); }}
          />
        </section>
      )}
    </>
  );
}

function Dashboard({ advisor, reload }: { advisor: MyAdvisorProfile; reload: () => void }) {
  const [tab, setTab] = useState<Tab>("requests");
  const bookingStatus = useBookingsStatus(); // requests can only arrive once the server has opened online booking
  const [tick, setTick] = useState(0);
  const bookings = useAsync(`advbookings|${tick}`, fetchAdvisorBookings);
  const [now] = useState(() => new Date());
  const rows = bookings.data ?? [];
  const groups = useMemo(() => ({
    requests: rows.filter((b) => b.status === "PENDING").sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    upcoming: rows.filter((b) => b.status === "CONFIRMED" && new Date(b.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    // confirmed consultations whose time has passed are waiting for the advisor to mark them completed
    // ended consultations waiting for a person to say what happened (the scheduler flags them with what attendance suggests)
    review: rows.filter((b) => b.status === "CONFIRMED" && b.needsReview).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    completed: rows.filter((b) => b.status === "COMPLETED" || (b.status === "CONFIRMED" && !b.needsReview && new Date(b.endsAt) <= now)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  }), [rows, now]);
  const refresh = () => setTick((t) => t + 1);
  const counts: Partial<Record<Tab, number>> = { requests: groups.requests.length, upcoming: groups.upcoming.length, review: groups.review.length, completed: groups.completed.length };

  return (
    <>
      {bookingStatus !== "open" && <p className="adv-review-note"><RuwadIcon name="info" size={14} /> {ADVISOR_BOOKING_NOT_OPEN_NOTE}</p>}
      <div className="profile-tabs-wrap adv-tabs-wrap">
        <div className="tabs" role="tablist" aria-label="Advisor dashboard">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}{counts[t.id] !== undefined && bookings.data ? <span className="adv-tab-count">{counts[t.id]}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-16" role="tabpanel">
        {(tab === "requests" || tab === "upcoming" || tab === "review" || tab === "completed") && (
          bookings.error ? <ErrorState title="Couldn't load your consultations" body={bookings.error} />
            : bookings.loading ? <LoadingState title="Loading your consultations…" />
            : groups[tab].length === 0 ? <EmptyState icon="calendar" title={tab === "requests" ? "No requests waiting" : tab === "upcoming" ? "No upcoming consultations" : tab === "review" ? "Nothing needs review" : "No completed consultations yet"} body={tab === "requests" ? "New consultation requests will appear here for you to approve or decline." : tab === "review" ? "After a consultation ends, it appears here until you confirm what happened." : undefined} />
            : <ul className="adv-booklist">{groups[tab].map((b) => <AdvisorRow key={b.id} b={b} tab={tab} now={now} onChanged={refresh} />)}</ul>
        )}
        {tab === "availability" && <AvailabilityTab />}
        {tab === "services" && <ServicesTab />}
        {tab === "profile" && <ProfileTab advisor={advisor} reload={reload} />}
      </div>
    </>
  );
}

function AdvisorRow({ b, tab, now, onChanged }: { b: BookingView; tab: Tab; now: Date; onChanged: () => void }) {
  const toast = useToast();
  const { openModal } = useModal();
  const [busy, setBusy] = useState(false);
  const ended = new Date(b.endsAt) <= now;
  const needsAnswer = b.pendingReschedule?.proposedBy === "FOUNDER" && b.status === "CONFIRMED";

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast(done); onChanged(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  return (
    <li className="adv-bookrow panel">
      <div className="adv-bookrow-main">
        <div className="adv-bookrow-title"><b>{b.serviceName}</b><BookingStatusBadge booking={b} />{b.isDemo && <span className="adv-demo">Demo</span>}</div>
        <div className="adv-bookrow-meta"><span>{b.startupName}</span>{b.requester && <span>Requested by {b.requester.name}</span>}</div>
        <div className="adv-bookrow-when"><RuwadIcon name="clock" size={13} /> {formatWhen(b.startsAt)} · {b.minutes} min <span className="muted small">Riyadh (UTC+3)</span></div>
        {expiryLine(b) && <div className="adv-bookrow-flag"><RuwadIcon name="clock" size={13} /> Please answer by {expiryLine(b)}. It expires after that.</div>}
        {b.description && <div className="adv-bookrow-note muted small">“{b.description}”</div>}
        {tab === "review" && <div className="adv-bookrow-flag"><RuwadIcon name="info" size={13} /> Attendance suggests: {outcomeLabel(b.attendanceOutcome) ?? "no attendance recorded"}. Please confirm what happened.</div>}
        {b.status === "COMPLETED" && b.attendanceOutcome && b.attendanceOutcome !== "ATTENDED_BOTH" && <div className="adv-bookrow-note muted small">Outcome: {outcomeLabel(b.attendanceOutcome)}</div>}
        {needsAnswer && <div className="adv-bookrow-flag"><RuwadIcon name="info" size={13} /> The startup proposed a new time: {formatWhen(b.pendingReschedule!.startsAt)}. Your current time stays booked until you answer.</div>}
      </div>
      <div className="adv-bookrow-side">
        <span className="muted small">{b.reference}</span>
        <div className="adv-actions">
          {tab === "requests" && (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => approveBooking(b.id), "Request approved")}>Approve</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => openModal(
                <NoteModal title="Decline this request?" body="The time is released and the startup is told you couldn't accept it." label="Note to the startup" confirmLabel="Decline request" danger
                  onSubmit={async (note) => { await rejectBooking(b.id, note); toast("Request declined"); onChanged(); }} />,
              )}>Decline</button>
            </>
          )}
          {tab === "review" && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => openModal(<ResolveOutcomeModal booking={b} onDone={onChanged} />)}>Record outcome</button>}
          {tab === "completed" && b.status === "CONFIRMED" && ended && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => completeBooking(b.id), "Marked as completed")}>Mark completed</button>}
          <Link className="btn btn-outline btn-sm" href={`/workspace/consultations/${b.id}`}>{needsAnswer ? "Respond" : tab === "upcoming" ? "Manage" : "View"}</Link>
        </div>
      </div>
    </li>
  );
}

function AvailabilityTab() {
  const [saved, setSaved] = useState<AvailabilityState | null>(null);
  const res = useAsync("avail", fetchMyAvailability);
  const value = saved ?? res.data;
  if (res.error) return <ErrorState title="Couldn't load your availability" body={res.error} />;
  if (!value) return <LoadingState title="Loading your availability…" />;
  return (
    <section className="panel panel-pad">
      <h2 className="adv-sec-title">Weekly hours and time off</h2>
      <AvailabilityEditor key={JSON.stringify(value.windows)} value={value} onSaveWindows={saveMyAvailability} onAddTimeOff={addMyTimeOff} onRemoveTimeOff={removeMyTimeOff} onChanged={setSaved} />
    </section>
  );
}

function ServicesTab() {
  const [tick, setTick] = useState(0);
  const res = useAsync(`svcs|${tick}`, fetchMyServices);
  if (res.error) return <ErrorState title="Couldn't load your services" body={res.error} />;
  if (!res.data) return <LoadingState title="Loading your services…" />;
  return (
    <section className="panel panel-pad">
      <h2 className="adv-sec-title">Consultation services</h2>
      <ServicesEditor services={res.data} onCreate={createMyService} onUpdate={updateMyService} onChanged={() => setTick((t) => t + 1)} />
    </section>
  );
}

function ProfileTab({ advisor, reload }: { advisor: MyAdvisorProfile; reload: () => void }) {
  const toast = useToast();
  return (
    <section className="panel panel-pad">
      <h2 className="adv-sec-title">Your profile</h2>
      <p className="adv-about">
        Your institution is shown as <b>{advisor.affiliationVerified ? "verified by RUWĀD" : "listed, not verified"}</b>.
        {advisor.affiliationVerified ? " Changing your institution removes the verification until it is checked again." : " Only a RUWĀD administrator can mark it verified."}
      </p>
      <div className="mt-16">
        <ProfileForm
          submitLabel="Save profile"
          initial={{ ...advisor.profile, yearsExperience: advisor.profile.yearsExperience ?? undefined }}
          onSubmit={async (v) => { await updateMyAdvisorProfile(v); toast("Profile saved"); reload(); }}
        />
      </div>
    </section>
  );
}
