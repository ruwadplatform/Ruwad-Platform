"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { fetchAdvisor } from "@/lib/api/advisory";
import { AdvisorAvatar } from "./AdvisorCard";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import { BookingPanel } from "./BookingPanel";
import { WEEKDAY_NAMES, formatWallClock } from "./advisory-time";
import type { AdvisorProfile } from "./advisory-types";

const TABS = ["Overview", "Research Areas", "Publications", "Consultation Services", "Availability", "Reviews"] as const;
type Tab = (typeof TABS)[number];

const tabId = (t: Tab) => `adv-tab-${t.toLowerCase().replace(/\s+/g, "-")}`;

/** Discover → Advisory Services → one advisor. Left: the profile (header + six tabs). Right: the booking form, which a service's Book button
 * pre-fills. Everything shown for a demonstration advisor is a labelled placeholder; empty tabs say so instead of inventing content. */
export function AdvisorProfilePage({ advisorId }: { advisorId: string }) {
  // The result is stored with the id it was fetched for, so navigating to another advisor shows the loading state until its own result arrives.
  const [loaded, setLoaded] = useState<{ id: string; advisor: AdvisorProfile | null; failed: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAdvisor(advisorId).then((a) => { if (alive) setLoaded({ id: advisorId, advisor: a, failed: false }); }).catch(() => { if (alive) setLoaded({ id: advisorId, advisor: null, failed: true }); });
    return () => { alive = false; };
  }, [advisorId]);

  const current = loaded?.id === advisorId ? loaded : null;
  const advisor = current ? current.advisor : undefined;

  if (current?.failed) return <ErrorState title="Couldn't load this advisor" body="Please try again in a moment." />;
  if (advisor === undefined) return <LoadingState title="Loading advisor…" />;
  if (advisor === null) {
    return <EmptyState icon="search" title="Advisor not found" body="This advisor isn't in the directory." action={<Link className="btn btn-outline" href="/discover/advisory-services">Back to Advisory Services</Link>} />;
  }
  return <ProfileView key={advisor.id} advisor={advisor} />;
}

function ProfileView({ advisor }: { advisor: AdvisorProfile }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [serviceId, setServiceId] = useState(advisor.services[0]?.id ?? "");
  const [flash, setFlash] = useState(false);
  const bookingRef = useRef<HTMLElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  function book(id: string) {
    setServiceId(id);
    bookingRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    setFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
  }

  function onTabKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = TABS.indexOf(tab);
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]!);
    document.getElementById(tabId(TABS[next]!))?.focus();
  }

  return (
    <div className="advisory-page adv-profile">
      <Breadcrumbs items={[{ label: "Discover" }, { label: "Advisory Services", href: "/discover/advisory-services" }, { label: advisor.name }]} />
      <div className="adv-profile-grid">
        <div className="adv-profile-main">
          <section className="adv-hero panel">
            <AdvisorAvatar name={advisor.name} size={88} />
            <div className="adv-hero-text">
              <h1 className="adv-profile-name">{advisor.name}</h1>
              <p className="adv-profile-role">{advisor.designation}</p>
              <p className="adv-inst">{advisor.institutionFull}{advisor.affiliationVerified ? "" : " · listed affiliation, not verified"}</p>
              <div className="adv-profile-meta">
                <span><RuwadIcon name="map" size={13} /> {advisor.location}</span>
                {advisor.yearsExperience != null && <span><RuwadIcon name="user" size={13} /> {advisor.yearsExperience}+ years of experience</span>}
                {advisor.isDemo && <span className="adv-demo" title="A fictional demonstration profile — not a real person">Demo profile</span>}
              </div>
            </div>
          </section>

          <div className="profile-tabs-wrap adv-tabs-wrap">
            <div className="tabs" role="tablist" aria-label="Advisor profile" onKeyDown={onTabKey}>
              {TABS.map((t) => (
                <button key={t} id={tabId(t)} type="button" role="tab" aria-selected={t === tab} aria-controls="adv-tabpanel" tabIndex={t === tab ? 0 : -1} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>
          </div>

          <section id="adv-tabpanel" role="tabpanel" aria-labelledby={tabId(tab)} className="panel panel-pad adv-tabpanel">
            {tab === "Overview" && <Overview advisor={advisor} />}
            {tab === "Research Areas" && <ResearchAreas advisor={advisor} />}
            {tab === "Publications" && <Publications advisor={advisor} />}
            {tab === "Consultation Services" && <Services advisor={advisor} activeId={serviceId} onBook={book} />}
            {tab === "Availability" && <Availability advisor={advisor} />}
            {tab === "Reviews" && <Reviews advisor={advisor} />}
          </section>
        </div>

        <aside className="adv-profile-side">
          <BookingPanel ref={bookingRef} advisor={advisor} serviceId={serviceId} onServiceChange={setServiceId} flash={flash} />
        </aside>
      </div>
    </div>
  );
}

function Overview({ advisor }: { advisor: AdvisorProfile }) {
  return (
    <>
      <h2 className="adv-sec-title">About</h2>
      <p className="adv-about">{advisor.about}</p>
      <h3 className="adv-sec-sub">Specializations</h3>
      <div className="adv-tags">{advisor.specializations.map((s) => <span key={s} className="adv-tag">{s}</span>)}</div>
      <h3 className="adv-sec-sub">Areas of expertise</h3>
      <p className="adv-about">{advisor.expertise}</p>
      <h3 className="adv-sec-sub">Qualifications</h3>
      <p className="adv-empty-line">No qualifications are listed. This is a demonstration profile, so none have been invented.</p>
    </>
  );
}

function ResearchAreas({ advisor }: { advisor: AdvisorProfile }) {
  return (
    <>
      <h2 className="adv-sec-title">Research areas</h2>
      {advisor.researchAreas.length === 0 ? (
        <p className="adv-empty-line">No research areas are listed yet.</p>
      ) : (
        <ul className="adv-chiplist">
          {advisor.researchAreas.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </>
  );
}

function Publications({ advisor }: { advisor: AdvisorProfile }) {
  return (
    <>
      <h2 className="adv-sec-title">Publications</h2>
      {advisor.publications.length === 0 ? (
        <EmptyState icon="info" title="No publications listed" body={advisor.isDemo ? "This is a fictional demonstration profile, so no publications are shown. Real advisors will list their own." : "This advisor hasn't listed any publications yet."} />
      ) : (
        <ul className="adv-pubs">
          {advisor.publications.map((p) => (
            <li key={`${p.title}-${p.year}`}>
              <b>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title}</b>
              <span className="muted small">{p.venue} · {p.year}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Services({ advisor, activeId, onBook }: { advisor: AdvisorProfile; activeId: string; onBook: (id: string) => void }) {
  return (
    <>
      <h2 className="adv-sec-title">Consultation services</h2>
      <ul className="adv-services">
        {advisor.services.map((s) => (
          <li key={s.id} className={`adv-service${s.id === activeId ? " is-active" : ""}`}>
            <div className="adv-service-body">
              <b>{s.name}</b>
              <p>{s.description}</p>
              <span className="adv-service-meta"><RuwadIcon name="clock" size={13} /> {s.minutes} minutes · Online via RUWĀD</span>
            </div>
            <button type="button" className="btn btn-primary adv-service-book" onClick={() => onBook(s.id)} aria-label={`Book ${s.name}`}>
              {s.id === activeId ? "Selected" : "Book"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Availability({ advisor }: { advisor: AdvisorProfile }) {
  const days = [...advisor.availability].sort((a, b) => a.weekday - b.weekday);
  return (
    <>
      <h2 className="adv-sec-title">Weekly availability</h2>
      <p className="adv-about">Times are shown in Riyadh time (UTC+3). Pick a date in the booking form to see the exact open slots, which also depend on the length of the consultation.</p>
      {days.length === 0 ? (
        <p className="adv-empty-line">This advisor has no regular availability at the moment.</p>
      ) : (
        <dl className="adv-week">
          {days.map((d) => (
            <div key={d.weekday}>
              <dt>{WEEKDAY_NAMES[d.weekday]}</dt>
              <dd>{d.windows.map((w) => `${formatWallClock(w.start)} – ${formatWallClock(w.end)}`).join("  ·  ")}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="adv-empty-line">Bookings need at least two hours&apos; notice and can be made up to 60 days ahead.</p>
    </>
  );
}

function Reviews({ advisor }: { advisor: AdvisorProfile }) {
  return (
    <>
      <h2 className="adv-sec-title">Reviews</h2>
      {advisor.reviews.length === 0 ? (
        <EmptyState icon="info" title="No reviews yet" body="Reviews appear here after people complete consultations with this advisor. No ratings are shown until then." />
      ) : (
        <ul className="adv-pubs">
          {advisor.reviews.map((r) => (
            <li key={r.id}><b>{r.rating} / 5</b><span>{r.comment}</span></li>
          ))}
        </ul>
      )}
    </>
  );
}
