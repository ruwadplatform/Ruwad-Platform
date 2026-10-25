"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { useSession } from "@/hooks/use-store";
import { fetchMyBookings } from "@/lib/api/advisory";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import type { BookingView } from "./advisory-types";
import { BookingStatusBadge, CONSULTATION_TABS, formatWhen, inTab, type ConsultationTab } from "./booking-format";
import { useAsync } from "./use-async";

/** Workspace → My Consultations: the founder's bookings in six tabs. A booking can appear in more than one (a future confirmed booking is both
 * Upcoming and Confirmed). Opening one gives the details, the history, and cancel / propose-a-new-time. */
export function MyConsultationsPage() {
  const { loggedIn, hydrated } = useSession();
  const [tab, setTab] = useState<ConsultationTab>("upcoming");
  const res = useAsync(loggedIn ? "mine" : null, fetchMyBookings);
  const [now] = useState(() => new Date());
  const rows = res.data;

  const counts = useMemo(() => Object.fromEntries(CONSULTATION_TABS.map((t) => [t.id, (rows ?? []).filter((b) => inTab(b, t.id, now)).length])) as Record<ConsultationTab, number>, [rows, now]);
  const shown = useMemo(() => {
    const list = (rows ?? []).filter((b) => inTab(b, tab, now));
    const soonestFirst = tab === "upcoming" || tab === "pending" || tab === "confirmed";
    return [...list].sort((a, b) => (soonestFirst ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt)));
  }, [rows, tab, now]);

  if (!hydrated) return <LoadingState />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to see your consultations" body="Your consultation requests and bookings live in your Workspace. Sign in or create a free account to continue." />;

  return (
    <div className="advisory-page">
      <Breadcrumbs items={[{ label: "Workspace" }, { label: "My Consultations" }]} />
      <PageHeader
        title="My Consultations"
        description="Your consultation requests and bookings with advisors."
        action={<Link className="btn btn-primary" href="/discover/advisory-services"><RuwadIcon name="calendar" size={14} /> Find an advisor</Link>}
      />

      <div className="profile-tabs-wrap adv-tabs-wrap mt-16">
        <div className="tabs" role="tablist" aria-label="Consultations">
          {CONSULTATION_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}{rows ? <span className="adv-tab-count">{counts[t.id]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-16" role="tabpanel">
        {res.error ? (
          <ErrorState title="Couldn't load your consultations" body={res.error} />
        ) : res.loading || !rows ? (
          <LoadingState title="Loading your consultations…" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={rows.length === 0 ? "No consultations yet" : `No ${CONSULTATION_TABS.find((t) => t.id === tab)!.label.toLowerCase()} consultations`}
            body={rows.length === 0 ? "Book a consultation with an advisor and it will appear here." : "Nothing in this tab right now."}
            action={rows.length === 0 ? <Link className="btn btn-primary" href="/discover/advisory-services">Browse advisors</Link> : undefined}
          />
        ) : (
          <ul className="adv-booklist">
            {shown.map((b) => <ConsultationRow key={b.id} b={b} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConsultationRow({ b }: { b: BookingView }) {
  const needsYou = b.pendingReschedule?.proposedBy === "ADVISOR" && b.status === "CONFIRMED";
  return (
    <li className="adv-bookrow panel">
      <div className="adv-bookrow-main">
        <div className="adv-bookrow-title">
          <b>{b.serviceName}</b>
          <BookingStatusBadge booking={b} />
          {b.isDemo && <span className="adv-demo">Demo</span>}
        </div>
        <div className="adv-bookrow-meta">
          <span>{b.advisor?.name ?? "Advisor"}{b.advisor ? ` · ${b.advisor.institution}` : ""}</span>
          <span>For {b.startupName}</span>
        </div>
        <div className="adv-bookrow-when"><RuwadIcon name="clock" size={13} /> {formatWhen(b.startsAt)} · {b.minutes} min <span className="muted small">Riyadh (UTC+3)</span></div>
        {needsYou && <div className="adv-bookrow-flag"><RuwadIcon name="info" size={13} /> The advisor proposed a new time: {formatWhen(b.pendingReschedule!.startsAt)}. Your current time stays booked until you answer.</div>}
        {b.decisionNote && b.status === "REJECTED" && <div className="adv-bookrow-note muted small">Advisor&apos;s note: {b.decisionNote}</div>}
      </div>
      <div className="adv-bookrow-side">
        <span className="muted small">{b.reference}</span>
        <Link className="btn btn-outline btn-sm" href={`/workspace/consultations/${b.id}`}>{needsYou ? "Respond" : "View details"}</Link>
      </div>
    </li>
  );
}
