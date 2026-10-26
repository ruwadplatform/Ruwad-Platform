"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { useSession } from "@/hooks/use-store";
import {
  adminCancelBooking, createAdvisorService, fetchAutomationStatus, runAutomation, fetchAdminAdvisor, fetchAdminAdvisors, fetchAdminApplications, fetchAdminBookings, fetchAdvisoryStats, reviewAdvisor, saveAdvisorAvailability, setAdvisorVerified, updateAdvisorService,
} from "@/lib/api/advisory";
import { ApplicationModal, ApplicationsTab, MIN_REJECTION_REASON } from "./AdminApplications";
import { AvailabilityEditor, ServicesEditor } from "./AdvisorEditors";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import { ResolveOutcomeModal } from "./AttendanceParts";
import { NoteModal } from "./booking-modals";
import { BookingStatusBadge, errText, formatWhen, outcomeLabel, statusLabel } from "./booking-format";
import type { AdminAdvisorRow, AdvisorReviewStatus, AvailabilityState, BookingStatus } from "./advisory-types";
import { useAsync } from "./use-async";
import type { AutomationReport } from "./advisory-types";

type Tab = "advisors" | "applications" | "bookings" | "review" | "stats" | "automation";
const TABS: { id: Tab; label: string }[] = [{ id: "advisors", label: "Advisors" }, { id: "applications", label: "Applications" }, { id: "bookings", label: "Bookings" }, { id: "review", label: "Needs review" }, { id: "stats", label: "Statistics" }, { id: "automation", label: "Automation" }];
const ADVISOR_STATUS: Record<AdvisorReviewStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "adv-badge-muted" },
  PENDING_REVIEW: { label: "Pending review", cls: "adv-badge-warn" },
  APPROVED: { label: "Approved", cls: "adv-badge-good" },
  REJECTED: { label: "Rejected", cls: "adv-badge-crit" },
  SUSPENDED: { label: "Suspended", cls: "adv-badge-crit" },
};

/** Admin → Advisory Management: review and onboard advisors, manage their hours and services, look through bookings, and see basic activity
 * numbers. An administrator can cancel a booking but cannot approve or reschedule one for either side. */
export function AdminAdvisoryPage() {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const { openModal } = useModal();
  const [tab, setTab] = useState<Tab>("advisors");
  const [tick, setTick] = useState(0);
  const pending = useAsync(loggedIn && isAdmin ? `admpending|${tick}` : null, () => fetchAdminApplications("PENDING_REVIEW"));
  const pendingCount = pending.data?.counts.PENDING_REVIEW;

  // The link in the "new application" email is /admin/advisory?application=<id>: open that application straight away (after signing in, if needed).
  useEffect(() => {
    if (!hydrated || !loggedIn || !isAdmin) return;
    const id = new URLSearchParams(window.location.search).get("application");
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => setTab("applications")); // after the effect, so the screen settles in one pass
    openModal(<ApplicationModal id={id} onChanged={() => setTick((t) => t + 1)} />, "xwide");
  }, [hydrated, loggedIn, isAdmin, openModal]);

  if (!hydrated) return <LoadingState />;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to manage Advisory Services." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  return (
    <div className="advisory-page">
      <Breadcrumbs items={[{ label: "Admin" }, { label: "Advisory Management" }]} />
      <PageHeader title="Advisory Management" description="Review advisors, manage their availability and services, and oversee consultation bookings." />
      <div className="profile-tabs-wrap adv-tabs-wrap mt-16">
        <div className="tabs" role="tablist" aria-label="Advisory Management">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}{t.id === "applications" && pendingCount ? <span className="adv-tab-count" aria-label={`${pendingCount} pending`}>{pendingCount}</span> : null}</button>)}
        </div>
      </div>
      <div className="mt-16" role="tabpanel">
        {tab === "advisors" && <AdvisorsTab />}
        {tab === "applications" && <ApplicationsTab key={tick} onChanged={() => setTick((t) => t + 1)} />}
        {tab === "bookings" && <BookingsTab />}
        {tab === "review" && <ReviewTab />}
        {tab === "stats" && <StatsTab />}
        {tab === "automation" && <AutomationTab />}
      </div>
    </div>
  );
}

function AdvisorsTab() {
  const toast = useToast();
  const { openModal } = useModal();
  const [status, setStatus] = useState("");
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const res = useAsync(`admadv|${status}|${tick}`, () => fetchAdminAdvisors(status || undefined));
  const reload = () => setTick((t) => t + 1);

  async function act(row: AdminAdvisorRow, action: "approve" | "reject" | "suspend", notes?: string) {
    setBusyId(row.id);
    try { await reviewAdvisor(row.id, action, notes); toast(`${row.name}: ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "suspended"}`); reload(); }
    catch (e) { toast(errText(e)); } finally { setBusyId(null); }
  }
  const withNote = (row: AdminAdvisorRow, action: "reject" | "suspend") => openModal(
    <NoteModal title={`${action === "reject" ? "Reject" : "Suspend"} ${row.name}?`} body={action === "reject" ? "The application is closed and the applicant is emailed this reason, so write it professionally. No one else sees it." : "The profile leaves the directory and can't take new bookings. Existing bookings are not cancelled."} label={action === "reject" ? "Reason for rejection" : "Note for the record"} confirmLabel={action === "reject" ? "Reject" : "Suspend"} danger required={action === "reject"} minLength={action === "reject" ? MIN_REJECTION_REASON : undefined}
      onSubmit={async (n) => { await reviewAdvisor(row.id, action, n); toast("Done"); reload(); }} />,
  );

  return (
    <>
      <div className="toolbar">
        <select className="select" style={{ width: "auto" }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All advisors</option>
          {(Object.keys(ADVISOR_STATUS) as AdvisorReviewStatus[]).map((s) => <option key={s} value={s}>{ADVISOR_STATUS[s].label}</option>)}
        </select>
      </div>
      <div className="mt-16">
        {res.error ? <ErrorState title="Couldn't load advisors" body={res.error} />
          : !res.data ? <LoadingState title="Loading advisors…" />
          : res.data.length === 0 ? <EmptyState icon="user" title="No advisors match" body="Advisor applications will appear here for review." />
          : (
            <div className="panel scroll-x">
              <table className="data-table">
                <thead><tr><th>Advisor</th><th>Institution</th><th>Applicant</th><th>Status</th><th>Affiliation</th><th></th></tr></thead>
                <tbody>
                  {res.data.map((a) => (
                    <tr key={a.id}>
                      <td><div className="cell-main">{a.name}{a.isDemo && <> <span className="adv-demo">Demo</span></>}</div><div className="muted small">{a.designation}</div></td>
                      <td className="small">{a.institution}</td>
                      <td className="small">{a.applicant ? <>{a.applicant.name}<div className="muted">{a.applicant.email}</div></> : "—"}</td>
                      <td><span className={`badge ${ADVISOR_STATUS[a.status].cls}`}>{ADVISOR_STATUS[a.status].label}</span>{a.reviewNotes && <div className="fs-11 muted mt-4">{a.reviewNotes}</div>}</td>
                      <td className="small">{a.affiliationVerified ? "Verified" : "Not verified"}</td>
                      <td>
                        <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                          {(a.status === "PENDING_REVIEW" || a.status === "REJECTED" || a.status === "SUSPENDED") && <button type="button" className="btn btn-primary btn-sm" disabled={busyId === a.id} onClick={() => act(a, "approve")}>{a.status === "PENDING_REVIEW" ? "Approve" : "Reinstate"}</button>}
                          {a.status === "PENDING_REVIEW" && <button type="button" className="btn btn-outline btn-sm" disabled={busyId === a.id} onClick={() => withNote(a, "reject")}>Reject</button>}
                          {a.status === "APPROVED" && <button type="button" className="btn btn-outline btn-sm" disabled={busyId === a.id} onClick={() => withNote(a, "suspend")}>Suspend</button>}
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => openModal(<ManageAdvisor id={a.id} onChanged={reload} />, "xwide")}>Manage</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

/** One advisor's profile, verification, weekly hours and services, for an administrator to review or adjust on their behalf. */
function ManageAdvisor({ id, onChanged }: { id: string; onChanged: () => void }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const [tick, setTick] = useState(0);
  const [availability, setAvailability] = useState<AvailabilityState | null>(null);
  const res = useAsync(`admone|${id}|${tick}`, () => fetchAdminAdvisor(id));
  if (res.error) return <div className="modal-box-pad"><ErrorState title="Couldn't load this advisor" body={res.error} /></div>;
  if (!res.data) return <div className="modal-box-pad"><LoadingState title="Loading advisor…" /></div>;
  const a = res.data;
  const avail = availability ?? a.availability;

  async function toggleVerified() {
    try { await setAdvisorVerified(a.id, !a.affiliationVerified); toast(a.affiliationVerified ? "Verification removed" : "Affiliation marked verified"); setTick((t) => t + 1); onChanged(); } catch (e) { toast(errText(e)); }
  }

  return (
    <div className="modal-box-pad adv-manage">
      <div className="adv-manage-head">
        <div>
          <h3 className="fs-16">{a.name}{a.isDemo && <> <span className="adv-demo">Demo profile</span></>}</h3>
          <p className="muted small">{a.designation} · {a.institutionFull} · {a.location}</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={closeModal}>Close</button>
      </div>
      <p className="adv-about mt-8">{a.about}</p>
      <div className="adv-actions mt-16">
        <span className="small">Affiliation: <b>{a.affiliationVerified ? "verified" : "listed, not verified"}</b></span>
        {!a.isDemo && <button type="button" className="btn btn-outline btn-sm" onClick={toggleVerified}>{a.affiliationVerified ? "Remove verification" : "Mark as verified"}</button>}
        {a.isDemo && <span className="muted small">Demonstration profiles are never verified.</span>}
      </div>
      <h4 className="adv-sec-sub">Weekly hours</h4>
      <AvailabilityEditor
        key={JSON.stringify(avail.windows)}
        value={avail}
        onSaveWindows={(w) => saveAdvisorAvailability(a.id, w)}
        onChanged={(v) => setAvailability(v)}
      />
      <h4 className="adv-sec-sub">Services</h4>
      <ServicesEditor
        services={a.profile.services}
        onCreate={(b) => createAdvisorService(a.id, b)}
        onUpdate={(sid, b) => updateAdvisorService(a.id, sid, b)}
        onChanged={() => { setTick((t) => t + 1); setAvailability(null); }}
      />
    </div>
  );
}

const BOOKING_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "REJECTED", "RESCHEDULED", "EXPIRED"];

function BookingsTab() {
  const toast = useToast();
  const { openModal } = useModal();
  const [status, setStatus] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [includeDemo, setIncludeDemo] = useState(false);
  const [tick, setTick] = useState(0);
  const advisors = useAsync("admadvlist", () => fetchAdminAdvisors());
  const res = useAsync(`admbook|${status}|${advisorId}|${includeDemo}|${tick}`, () => fetchAdminBookings({ status: status || undefined, advisorId: advisorId || undefined, includeDemo }));
  const [now] = useState(() => new Date());

  return (
    <>
      <div className="toolbar adv-toolbar">
        <select className="select" style={{ width: "auto" }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} aria-label="Filter by advisor" value={advisorId} onChange={(e) => setAdvisorId(e.target.value)}>
          <option value="">All advisors</option>
          {(advisors.data ?? []).filter((a) => includeDemo || !a.isDemo).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="adv-check"><input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} /> Include demonstration bookings</label>
      </div>
      <div className="mt-16">
        {res.error ? <ErrorState title="Couldn't load bookings" body={res.error} />
          : !res.data ? <LoadingState title="Loading bookings…" />
          : res.data.length === 0 ? <EmptyState icon="calendar" title="No bookings match" body="Demonstration bookings are hidden unless you include them." />
          : (
            <div className="panel scroll-x">
              <table className="data-table">
                <thead><tr><th>Reference</th><th>Consultation</th><th>Advisor</th><th>Startup</th><th>When</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {res.data.map((b) => (
                    <tr key={b.id}>
                      <td className="small">{b.reference}{b.isDemo && <> <span className="adv-demo">Demo</span></>}</td>
                      <td className="small">{b.serviceName}<div className="muted">{b.minutes} min</div></td>
                      <td className="small">{b.advisor?.name ?? "—"}</td>
                      <td className="small">{b.startupName}</td>
                      <td className="small">{formatWhen(b.startsAt)}</td>
                      <td><BookingStatusBadge booking={b} /></td>
                      <td>
                        <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                          <Link className="btn btn-outline btn-sm" href={`/workspace/consultations/${b.id}`}>View</Link>
                          {(b.status === "PENDING" || b.status === "CONFIRMED") && new Date(b.startsAt) > now && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => openModal(
                              <NoteModal title="Cancel this consultation?" body="Both the startup and the advisor will be told it was cancelled by an administrator." label="Reason" confirmLabel="Cancel consultation" danger
                                onSubmit={async (reason) => { await adminCancelBooking(b.id, reason); toast("Consultation cancelled"); setTick((t) => t + 1); }} />,
                            )}>Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}

function StatsTab() {
  const [includeDemo, setIncludeDemo] = useState(false);
  const res = useAsync(`stats|${includeDemo}`, () => fetchAdvisoryStats(includeDemo));
  const max = useMemo(() => Math.max(1, ...Object.values(res.data?.bookings.byStatus ?? {})), [res.data]);
  return (
    <>
      <label className="adv-check"><input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} /> Include demonstration advisors and bookings</label>
      <p className="muted small mt-8">{includeDemo ? "Showing everything, including fictional demonstration activity." : "Demonstration advisors and bookings are left out, so test activity never inflates real figures."}</p>
      <div className="mt-16">
        {res.error ? <ErrorState title="Couldn't load statistics" body={res.error} />
          : !res.data ? <LoadingState title="Loading statistics…" />
          : (
            <>
              <div className="stat-mini-row">
                <StatCard label="Bookings" value={res.data.bookings.total} />
                <StatCard label="Last 30 days" value={res.data.bookings.last30Days} />
                <StatCard label="Upcoming confirmed" value={res.data.bookings.upcomingConfirmed} />
                <StatCard label="Approved advisors" value={res.data.advisors.byStatus.APPROVED ?? 0} />
                <StatCard label="Awaiting review" value={res.data.advisors.byStatus.PENDING_REVIEW ?? 0} />
              </div>
              <div className="adv-stats-grid mt-16">
                <section className="panel panel-pad">
                  <h3 className="adv-sec-sub" style={{ marginTop: 0 }}>Bookings by status</h3>
                  <ul className="adv-bars">
                    {Object.entries(res.data.bookings.byStatus).map(([s, n]) => (
                      <li key={s}><span>{statusLabel(s as BookingStatus)}</span><span className="adv-bar"><i style={{ width: `${(n / max) * 100}%` }} /></span><b>{n}</b></li>
                    ))}
                  </ul>
                </section>
                <section className="panel panel-pad">
                  <h3 className="adv-sec-sub" style={{ marginTop: 0 }}>Most booked advisors</h3>
                  {res.data.topAdvisors.length === 0 ? <p className="adv-empty-line">No bookings yet.</p> : (
                    <ul className="adv-bars is-simple">
                      {res.data.topAdvisors.map((t) => <li key={t.id}><span>{t.name}{t.isDemo && <> <span className="adv-demo">Demo</span></>}</span><b>{t.bookings}</b></li>)}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
      </div>
    </>
  );
}

/** The scheduler's settings and a safe way to see what it would do. A dry run changes nothing; "Run now" does one real pass (still with mock email). */
function AutomationTab() {
  const toast = useToast();
  const { openModal } = useModal();
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<AutomationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const res = useAsync(`automation|${tick}`, fetchAutomationStatus);

  async function run(dryRun: boolean) {
    setBusy(true);
    try { setResult(await runAutomation(dryRun)); if (!dryRun) setTick((t) => t + 1); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  if (res.error) return <ErrorState title="Couldn't load the automation status" body={res.error} />;
  if (!res.data) return <LoadingState title="Loading automation status…" />;
  const s = res.data;
  return (
    <>
      <div className="stat-mini-row">
        <StatCard label="Scheduler" value={s.schedulerEnabled ? "On" : "Off"} />
        <StatCard label="Request expiry" value={`${s.requestExpiryHours} h`} />
        <StatCard label="Answer cutoff" value={`${s.cutoffMinutes} min before`} />
        <StatCard label="Reminders" value={s.reminderHours.map((h) => `${h} h`).join(" + ")} />
        <StatCard label="Auto-completion" value={s.autoComplete ? "On" : "Off"} />
      </div>
      <p className="muted small mt-8">
        {s.schedulerEnabled ? `The scheduler runs every ${s.tickSeconds} seconds on this server.` : "The scheduler is off on this server. Nothing expires or is sent automatically; you can still dry-run it below."} Email is in mock mode unless it was explicitly switched to live, and demonstration bookings are never emailed.
      </p>
      <div className="adv-actions mt-16">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(true)}>{busy ? "Working…" : "Dry run (changes nothing)"}</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => openModal(
          <NoteModal title="Run one automation pass now?" body="This really expires overdue requests and records reminders. Email stays in mock mode unless it was switched to live." label="Note for the record" confirmLabel="Run now"
            onSubmit={async () => { await run(false); toast("Pass complete"); }} />,
        )}>Run now</button>
      </div>
      {result && (
        <section className="panel panel-pad mt-16">
          <h3 className="adv-sec-sub" style={{ marginTop: 0 }}>{result.dryRun ? "Dry run: what would happen" : "Pass complete"} <span className="muted small">{formatWhen(result.ranAt)}</span></h3>
          <ul className="adv-bars is-simple">
            <li><span>Requests that expire</span><b>{result.expired}</b></li>
            <li><span>Reschedule proposals that expire</span><b>{result.proposalsExpired}</b></li>
            <li><span>Expiry warnings</span><b>{result.expiryWarnings}</b></li>
            <li><span>24-hour reminders</span><b>{result.reminders24h}</b></li>
            <li><span>1-hour reminders</span><b>{result.reminders1h}</b></li>
          </ul>
          {result.references.length > 0 && <p className="muted small mt-8">Bookings: {[...new Set(result.references)].join(", ")}</p>}
        </section>
      )}
      {s.lastError && <p className="adv-review-note adv-review-error mt-16" role="alert">Last scheduled pass failed: {s.lastError}</p>}
    </>
  );
}

/** The Needs Review queue: consultations that have ended and still need a person to say what happened, with what attendance suggested. */
function ReviewTab() {
  const { openModal } = useModal();
  const [includeDemo, setIncludeDemo] = useState(false);
  const [tick, setTick] = useState(0);
  const res = useAsync(`admreview|${includeDemo}|${tick}`, () => fetchAdminBookings({ needsReview: true, includeDemo }));
  return (
    <>
      <label className="adv-check"><input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} /> Include demonstration bookings</label>
      <div className="mt-16">
        {res.error ? <ErrorState title="Couldn't load the queue" body={res.error} />
          : !res.data ? <LoadingState title="Loading the queue…" />
          : res.data.length === 0 ? <EmptyState icon="check" title="Nothing needs review" body="Consultations appear here after they end, until the advisor (or you) confirm what happened." />
          : (
            <div className="panel scroll-x">
              <table className="data-table">
                <thead><tr><th>Reference</th><th>Consultation</th><th>Advisor</th><th>Startup</th><th>Ended</th><th>Attendance suggests</th><th></th></tr></thead>
                <tbody>
                  {res.data.map((b) => (
                    <tr key={b.id}>
                      <td className="small">{b.reference}{b.isDemo && <> <span className="adv-demo">Demo</span></>}</td>
                      <td className="small">{b.serviceName}<div className="muted">{b.minutes} min</div></td>
                      <td className="small">{b.advisor?.name ?? "—"}</td>
                      <td className="small">{b.startupName}</td>
                      <td className="small">{formatWhen(b.endsAt)}</td>
                      <td className="small">{outcomeLabel(b.attendanceOutcome) ?? "—"}</td>
                      <td>
                        <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                          <Link className="btn btn-outline btn-sm" href={`/workspace/consultations/${b.id}`}>View</Link>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(<ResolveOutcomeModal booking={b} onDone={() => setTick((t) => t + 1)} />)}>Record outcome</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}
