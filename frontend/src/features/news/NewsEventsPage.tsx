"use client";

import { useEffect, useMemo, useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { NewsCard } from "@/components/intelligence/NewsCard";
import { EventCard } from "@/components/intelligence/EventCard";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { useSession } from "@/hooks/use-store";
import { capForGuest } from "@/lib/auth-gate";
import { useNews, useEvents } from "@/hooks/use-directory-data";
import { compareEvents, eventStatusOf } from "@/lib/content-format";
import { readUrlFlash } from "@/hooks/use-google-calendar";
import { NEWS_CATEGORIES, EVENT_TYPES } from "@/data/reference";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";

type Tab = "News" | "Events";

export function NewsEventsPage() {
  const [tab, setTab] = useState<Tab>("News");
  // Back from the Google Calendar consent screen: show the Events tab, where the clicked event's button is waiting.
  useEffect(() => { if (readUrlFlash()) queueMicrotask(() => setTab("Events")); }, []);
  return (
    <div className="news-page">
      <IntelligencePageHeader title="News & Events" />
      <div className="tabs mb-24 mt-16">
        <button className={tab === "News" ? "active" : ""} onClick={() => setTab("News")}>News</button>
        <button className={tab === "Events" ? "active" : ""} onClick={() => setTab("Events")}>Events</button>
      </div>
      {tab === "News" ? <NewsTab /> : <EventsTab />}
    </div>
  );
}

function NewsTab() {
  const { loggedIn, hydrated } = useSession();
  const { data: NEWS, loading, error } = useNews();
  const [category, setCategory] = useState("All");
  const [country, setCountry] = useState("All");
  const sorted = useMemo(() => [...NEWS].sort((a, b) => (a.publishedDate < b.publishedDate ? 1 : -1)), [NEWS]);
  // Filter options come from what was actually collected.
  const categories = useMemo(() => NEWS_CATEGORIES.filter((c) => sorted.some((n) => n.category === c)), [sorted]);
  const countries = useMemo(() => [...new Set(sorted.map((n) => n.geography).filter(Boolean))].sort(), [sorted]);
  const filtered = useMemo(
    () => sorted.filter((n) => (category === "All" || n.category === category) && (country === "All" || n.geography === country)),
    [sorted, category, country],
  );
  const { shown, capped } = capForGuest(filtered, 6, !hydrated || !loggedIn);


  if (error) return <ErrorState title="Couldn&apos;t load news" body={error} />;
  if (loading) return <LoadingState title="Loading news…" />;
  if (!NEWS.length) return <EmptyState icon="news" title="No news available yet" body="Healthcare news is collected automatically — check back soon." />;

  return (
    <div>
      <div className="toolbar mb-12">
        <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} style={{ maxWidth: 200 }} aria-label="Filter by country">
          <option value="All">All Countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="chip-select mb-20">
        <button className={category === "All" ? "active" : ""} onClick={() => setCategory("All")}>All</button>
        {categories.map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}
      </div>

      {shown.length > 0 && <div className="panel mb-24">{shown.map((n) => <NewsCard key={n.id} article={n} />)}</div>}
      {!shown.length && <EmptyState icon="news" title="No news matches those filters" body="Try a different category or country." />}
      {hydrated && capped && <DirectoryGateBanner entityLabelPlural="News Articles" totalCount={filtered.length} />}
    </div>
  );
}

function EventsTab() {
  const { loggedIn, hydrated } = useSession();
  const { data: EVENTS, loading, error } = useEvents();
  const [type, setType] = useState("All");
  const [country, setCountry] = useState("All");
  const [status, setStatus] = useState<"All" | "ONGOING" | "UPCOMING">("All");

  // Only events that are still relevant today — checked again here so a tab
  // left open past an event's end never shows it.
  const current = useMemo(() => EVENTS.filter((e) => eventStatusOf(e.startDate, e.endDate) !== "PAST"), [EVENTS]);
  const countries = useMemo(() => [...new Set(current.map((e) => e.country).filter(Boolean))].sort(), [current]);
  const filtered = useMemo(
    () => current
      .filter((e) => (type === "All" || e.type === type) && (country === "All" || e.country === country) && (status === "All" || eventStatusOf(e.startDate, e.endDate) === status))
      .sort(compareEvents),
    [current, type, country, status],
  );
  const { shown, capped } = capForGuest(filtered, 6, !hydrated || !loggedIn);

  return (
    <div>
      <div className="toolbar mb-20">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 220 }} aria-label="Filter by event type">
          <option value="All">All Event Types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} style={{ maxWidth: 200 }} aria-label="Filter by country">
          <option value="All">All Countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ maxWidth: 190 }} aria-label="Filter by status">
          <option value="All">Ongoing &amp; Upcoming</option>
          <option value="ONGOING">Ongoing now</option>
          <option value="UPCOMING">Upcoming</option>
        </select>
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading events…" : `${filtered.length} event${filtered.length === 1 ? "" : "s"}`}</div>
      {error ? (
        <ErrorState title="Couldn&apos;t load events" body={error} />
      ) : loading ? (
        <LoadingState title="Loading events…" />
      ) : !current.length ? (
        <EmptyState icon="clock" title="No upcoming events available yet" body="Events are collected automatically — check back soon." />
      ) : !filtered.length ? (
        <EmptyState icon="search" title="No events match those filters" body="Try a different type, country or status." />
      ) : (
        <div className="events-grid">{shown.map((e) => <EventCard key={e.id} event={e} />)}</div>
      )}
      {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Events" totalCount={filtered.length} />}
    </div>
  );
}
