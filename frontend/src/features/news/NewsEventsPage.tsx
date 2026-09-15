"use client";

import { useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { SectionHeader } from "@/components/intelligence/SectionHeader";
import { NewsCard } from "@/components/intelligence/NewsCard";
import { EventCard } from "@/components/intelligence/EventCard";
import { DirectoryGateBanner } from "@/components/shared/DirectoryGateBanner";
import { useSession } from "@/hooks/use-store";
import { capForGuest } from "@/lib/auth-gate";
import { useNews, useEvents } from "@/hooks/use-directory-data";
import { NEWS_CATEGORIES, EVENT_TYPES, COUNTRIES } from "@/data/reference";

type Tab = "News" | "Events";

export function NewsEventsPage() {
  const [tab, setTab] = useState<Tab>("News");
  return (
    <div className="news-page">
      <IntelligencePageHeader title="News & Events" description="Healthcare intelligence monitoring — funding, partnerships, regulation and the events shaping the ecosystem." />
      <div className="tabs mb-24 mt-16">
        <button className={tab === "News" ? "active" : ""} onClick={() => setTab("News")}>Healthcare News</button>
        <button className={tab === "Events" ? "active" : ""} onClick={() => setTab("Events")}>Upcoming Events</button>
      </div>
      {tab === "News" ? <NewsTab /> : <EventsTab />}
    </div>
  );
}

function NewsTab() {
  const { loggedIn, hydrated } = useSession();
  const { data: NEWS, loading, error } = useNews();
  const [category, setCategory] = useState("All");
  const sorted = useMemo(() => [...NEWS].sort((a, b) => (a.publishedDate < b.publishedDate ? 1 : -1)), [NEWS]);
  const topStories = sorted.slice(0, 3);
  const filtered = useMemo(() => {
    const rest = sorted.slice(3);
    return category === "All" ? rest : rest.filter((n) => n.category === category);
  }, [sorted, category]);
  const { shown, capped } = capForGuest(filtered, 6, !hydrated || !loggedIn);

  const bySaudi = shown.filter((n) => n.geography === "Saudi Arabia");
  const byRegional = shown.filter((n) => n.geography !== "Saudi Arabia");

  if (error) return <div className="empty-state"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load news</h4><p>{error}</p></div>;
  if (loading) return <div className="empty-state"><RuwadIcon name="news" size={30} /><h4>Loading news…</h4></div>;
  if (!NEWS.length) return <div className="empty-state"><RuwadIcon name="news" size={30} /><h4>No news available yet</h4></div>;

  return (
    <div>
      <SectionHeader title="Top Stories" />
      <div className="panel mb-24">{topStories.map((n) => <NewsCard key={n.id} article={n} />)}</div>

      <div className="chip-select mb-20">
        <button className={category === "All" ? "active" : ""} onClick={() => setCategory("All")}>All</button>
        {NEWS_CATEGORIES.map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}
      </div>

      {bySaudi.length > 0 && (
        <div className="mb-24">
          <SectionHeader title="Saudi Healthcare" />
          <div className="panel">{bySaudi.map((n) => <NewsCard key={n.id} article={n} />)}</div>
        </div>
      )}
      {byRegional.length > 0 && (
        <div className="mb-24">
          <SectionHeader title="GCC & MENA" />
          <div className="panel">{byRegional.map((n) => <NewsCard key={n.id} article={n} />)}</div>
        </div>
      )}
      {!shown.length && <div className="empty-state"><RuwadIcon name="news" size={30} /><h4>No news in this category</h4><p>Try a different category filter.</p></div>}
      {hydrated && capped && <DirectoryGateBanner entityLabelPlural="News Articles" totalCount={filtered.length + topStories.length} />}
    </div>
  );
}

function EventsTab() {
  const { loggedIn, hydrated } = useSession();
  const { data: EVENTS, loading, error } = useEvents();
  const [type, setType] = useState("All");
  const [country, setCountry] = useState("All");

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const list = EVENTS.filter((e) => (type === "All" || e.type === type) && (country === "All" || e.country === country));
    const upcoming = list.filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
    const past = list.filter((e) => e.date < today).sort((a, b) => (a.date > b.date ? -1 : 1));
    return [...upcoming, ...past];
  }, [EVENTS, type, country]);
  const { shown, capped } = capForGuest(filtered, 6, !hydrated || !loggedIn);

  return (
    <div>
      <div className="toolbar mb-20">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="All">All Event Types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="All">All Countries</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="result-count small muted mb-12">{loading ? "Loading events…" : `${filtered.length} event${filtered.length === 1 ? "" : "s"}`}</div>
      {error ? (
        <div className="empty-state"><RuwadIcon name="help" size={30} /><h4>Couldn&apos;t load events</h4><p>{error}</p></div>
      ) : loading ? (
        <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>Loading events…</h4></div>
      ) : !EVENTS.length ? (
        <div className="empty-state"><RuwadIcon name="clock" size={30} /><h4>No upcoming events available</h4></div>
      ) : !filtered.length ? (
        <div className="empty-state"><RuwadIcon name="search" size={30} /><h4>No events match those filters</h4><p>Try a different type or country.</p></div>
      ) : (
        <div className="events-grid">{shown.map((e) => <EventCard key={e.id} event={e} />)}</div>
      )}
      {hydrated && capped && <DirectoryGateBanner entityLabelPlural="Events" totalCount={filtered.length} />}
    </div>
  );
}
