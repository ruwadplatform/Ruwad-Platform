"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { LockedTeaser } from "@/components/shared/LockedTeaser";
import { useSession, useWatchlist, useIntros, useOwnedListings } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";
import { compareEvents, eventStatusOf, formatEventDates, safeHttpUrl } from "@/lib/content-format";
import { AddToCalendar } from "@/components/intelligence/AddToCalendar";
import { useStartups, useInvestors, useHubs, useNews, useEvents, useReports } from "@/hooks/use-directory-data";
import { initials } from "@/lib/scoring";
import { regBadgeClass } from "@/lib/widgets";

const PERSONAS = ["For Investors", "For Startups", "For Corporations", "For Researchers"] as const;
type Persona = (typeof PERSONAS)[number];

interface Insight { icon: RuwadIconName; h: string; p: string; route: string }
const PERSONA_INSIGHTS: Record<Persona, Insight[]> = {
  "For Investors": [
    { icon: "startups", h: "Find recently updated healthcare startups", p: "Explore companies updated this month.", route: "/startups" },
    { icon: "investors", h: "Benchmark against active investors", p: "See who else is deploying capital nearby.", route: "/investors" },
    { icon: "lock", h: "Request secure Data Room access", p: "Sign an NDA in-platform and unlock verified financials and clinical data.", route: "/startups" },
    { icon: "research", h: "Biotechnology landscape", p: "View Saudi biotechnology companies.", route: "/startups?cat=Biotechnology" },
  ],
  "For Startups": [
    { icon: "investors", h: "Discover active healthcare investors", p: "View investors actively deploying capital.", route: "/investors" },
    { icon: "lock", h: "Manage your Data Room", p: "Approve investor NDA requests and control who sees your confidential documents.", route: "/my-startup" },
    { icon: "reports", h: "Read the latest funding report", p: "Benchmark your round against the market.", route: "/reports" },
    { icon: "mystartup", h: "List your startup", p: "Get discovered by investors and hubs.", route: "/submit/startup" },
  ],
  "For Corporations": [
    { icon: "corp", h: "Scout partnership-ready startups", p: "Filter by clinical readiness and stage.", route: "/startups" },
    { icon: "lock", h: "Request due-diligence access", p: "Sign an NDA in-platform to unlock a target's confidential Data Room.", route: "/startups" },
    { icon: "reports", h: "Market intelligence reports", p: "Sector-by-sector investment analysis.", route: "/reports" },
    { icon: "hubs", h: "Explore innovation hubs", p: "Where corporate-startup pilots start.", route: "/hubs" },
  ],
  "For Researchers": [
    { icon: "research", h: "Biotechnology landscape", p: "View Saudi biotechnology companies.", route: "/startups?cat=Biotechnology" },
    { icon: "startups", h: "Genomics & diagnostics ventures", p: "Companies translating research to market.", route: "/startups?cat=Genomics" },
    { icon: "reports", h: "Read the latest ecosystem report", p: "Sector trends and regulatory landscape.", route: "/reports" },
    { icon: "bi", h: "AI in Saudi Healthcare", p: "Explore AI startups and technologies.", route: "/startups?cat=AI Healthcare" },
  ],
};

const STACK_CATS = ["Biotechnology", "Digital Health", "Medical Devices", "Diagnostics", "AI Healthcare", "Pharmaceuticals", "Other"];
const STACK_COLORS = ["#128A45", "#1DB460", "#0B3D2E", "#2563A6", "#C9A227", "#687386", "#D7DAE0"];

export function DashboardPage() {
  const { user, loggedIn } = useSession();

  return (
    <div className="dashboard-page">
      <DashboardIntro loggedIn={loggedIn} firstName={user?.firstName} />
      <EcosystemDashboard loggedIn={loggedIn} />
    </div>
  );
}

/** Renders for both guests and logged-in users — hero, featured profiles,
 * ecosystem snapshot and funding visualization are ecosystem-level content,
 * not personal data, so there's no reason to gate them behind auth. Only
 * the personalized greeting and the personal KPI row (My Listings/Saved/
 * Intro Requests/Data Room) stay logged-in-only. */
function DashboardIntro({ loggedIn, firstName }: { loggedIn: boolean; firstName?: string }) {
  const router = useRouter();
  const { hydrated } = useSession();
  const wl = useWatchlist();
  const intros = useIntros();
  const listings = useOwnedListings();
  const { data: REPORTS } = useReports();
  const latestReport = REPORTS.length
    ? [...REPORTS].sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))[0]
    : null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mb-32">
      {!hydrated ? (
        <>
          <span className="skel" style={{ width: 220, height: 22 }} />
          <div className="mt-8"><span className="skel" style={{ width: 320 }} /></div>
        </>
      ) : loggedIn && firstName ? (
        <>
          <h1 className="fs-22">{greet}, {firstName}.</h1>
          <p className="muted fs-13" style={{ marginTop: 6 }}>Here&apos;s what&apos;s happening across the healthcare innovation ecosystem.</p>
        </>
      ) : (
        <>
          <h1 className="fs-22">Welcome to RUWĀD.</h1>
          <p className="muted fs-13" style={{ marginTop: 6 }}>The Saudi &amp; MENA healthcare innovation ecosystem, mapped.</p>
        </>
      )}

      <div className="eco-hero mt-24">
        <div className="eco-hero-in">
          <div className="eco-hero-main">
            <div className="eyebrow">Saudi Healthcare Innovation Ecosystem</div>
            <h2>Discover the Saudi &amp; MENA Healthcare Innovation Ecosystem</h2>
            <p>Explore startups, investors, technologies, research organizations and healthcare innovation opportunities across the region.</p>
            <div className="eco-hero-cta">
              <Link href="/ecosystem" className="btn btn-primary">Explore Ecosystem</Link>
              <button className="btn" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }} onClick={() => { if (requireAuth("route", { label: "list" })) router.push("/submit/startup"); }}>List Your Startup</button>
            </div>
          </div>
          {latestReport && (
            <div className="eco-hero-side">
              <div><span className="rep-badge">NEW REPORT</span><h4>{latestReport.title}</h4></div>
              <Link href={`/reports/${latestReport.id}`} className="btn btn-gold btn-sm">VIEW REPORT</Link>
            </div>
          )}
        </div>
      </div>

      {!hydrated ? (
        <div className="kpi-row mt-24 personal-kpi-row" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => <span key={i} className="skel" style={{ height: 60, borderRadius: "var(--radius-md, 8px)" }} />)}
        </div>
      ) : loggedIn && (
        <div className="kpi-row mt-24 personal-kpi-row">
          <ActivityCard iconName="listings" label="My Listings" count={listings.length} route="/my-organizations" />
          <ActivityCard iconName="startups" label="Saved Startups" count={wl.startups.length} route="/watchlist" />
          <ActivityCard iconName="investors" label="Saved Investors" count={wl.investors.length} route="/watchlist" />
          <ActivityCard iconName="intros" label="Intro Requests" count={intros.length} route="/introductions" />
          <ActivityCard iconName="lock" label="Data Room Access" count={0} route="/my-ndas" />
        </div>
      )}

      <div className="mt-32">
        <PersonaSection />

        <FeaturedProfiles />
      </div>

      <EcosystemSnapshot />
      <HealthcareInvestments />
    </div>
  );
}

function ActivityCard({ iconName, label, count, route }: { iconName: RuwadIconName; label: string; count: number; route: string }) {
  return (
    <Link href={route} className="kpi activity-card">
      <div className="ac-icon"><RuwadIcon name={iconName} size={15} /></div>
      <div className="k-label">{label}</div>
      <div className="k-val">{count}</div>
      <span className="ac-link">View all <RuwadIcon name="arrow" size={11} /></span>
    </Link>
  );
}

function PersonaSection() {
  const [persona, setPersona] = useState<Persona>("For Investors");
  return (
    <>
      <div className="persona-row">
        {PERSONAS.map((p) => (
          <button key={p} className={`persona-btn${p === persona ? " active" : ""}`} onClick={() => setPersona(p)}>{p}</button>
        ))}
      </div>
      <div className="insight-row">
        {PERSONA_INSIGHTS[persona].map((c) => (
          <Link key={c.h} href={c.route} className="insight-card" style={{ textAlign: "left" }}>
            <div className="ic-icon"><RuwadIcon name={c.icon} size={16} /></div>
            <h4>{c.h}</h4><p>{c.p}</p>
            <span className="ic-arrow">Explore <RuwadIcon name="arrow" size={13} /></span>
          </Link>
        ))}
      </div>
    </>
  );
}

function FeaturedProfiles() {
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();
  const { data: HUBS_ENABLERS } = useHubs();
  const items = [
    ...STARTUPS.slice(0, 4).map((s) => ({ n: s.name, route: "/startups/" + s.id })),
    ...INVESTORS.slice(0, 4).map((v) => ({ n: v.name, route: "/investors/" + v.id })),
    ...HUBS_ENABLERS.slice(0, 2).map((h) => ({ n: h.name, route: "/hubs/" + h.id })),
  ];
  if (!items.length) return null;
  return (
    <>
      <div className="panel-head" style={{ border: "none", padding: "4px 0 12px" }}><h3 className="fs-14">Featured Profiles</h3></div>
      <div className="featured-row">
        {items.map((x, i) => (
          <Link key={i} href={x.route} className="featured-card">
            <div className="flogo">{initials(x.n)}</div><b>{x.n}</b>
          </Link>
        ))}
      </div>
    </>
  );
}

function EcosystemSnapshot() {
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();
  const { data: HUBS_ENABLERS } = useHubs();
  const trackedFunding = STARTUPS.reduce((sum, s) => sum + (s.fundingTotal || 0), 0);
  const catCounts: Record<string, number> = {};
  STARTUPS.forEach((s) => { catCounts[s.category] = (catCounts[s.category] || 0) + 1; });
  const topEntry = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
  const [topCatName, topCatCount] = topEntry ?? ["—", 0];
  const openHubs = HUBS_ENABLERS.filter((h) => h.status === "Open").length;
  return (
    <div className="panel panel-pad mt-32">
      <h3 className="fs-14" style={{ marginBottom: 4 }}>Ecosystem snapshot</h3>
      <p className="muted small" style={{ marginBottom: 16 }}>Live counts from RUWĀD&apos;s tracked directories — no trend claims, since there&apos;s no historical data yet to compute one honestly.</p>
      <div className="kpi-row">
        <div className="kpi"><div className="k-label">Tracked Funding</div><div className="k-val fs-16">SAR {trackedFunding.toFixed(1)}M</div><div className="k-delta">{STARTUPS.length} startups</div></div>
        <div className="kpi"><div className="k-label">Top Category</div><div className="k-val fs-16">{topCatName}</div><div className="k-delta">{topCatCount} venture{topCatCount === 1 ? "" : "s"}</div></div>
        <div className="kpi"><div className="k-label">Active Investors</div><div className="k-val fs-16">{INVESTORS.length}</div><div className="k-delta">tracked in directory</div></div>
        <div className="kpi"><div className="k-label">Hubs &amp; Programs</div><div className="k-val fs-16">{HUBS_ENABLERS.length}</div><div className="k-delta">{openHubs} open now</div></div>
      </div>
    </div>
  );
}

/** Published, individually-sourced figures on healthcare investment/market
 * size in Saudi Arabia — external market context, not anything RUWĀD
 * itself tracks. Shown only until real submitted funding data exists (see
 * HealthcareInvestments below), each figure links straight to its source
 * so it's never mistaken for a RUWĀD-verified number. */
const MARKET_INVESTMENT_STATS = [
  {
    value: "$788M", label: "Raised across 3 Saudi healthcare IPOs in 2024 — ~22% of all Gulf IPO proceeds that year",
    source: "AGBI, Oct 2024", href: "https://www.agbi.com/analysis/health/2024/10/healthcare-sector-next-target-for-saudi-private-equity/",
  },
  {
    value: "$250M", label: "Jada Fund of Funds (PIF-owned) fundraising round to invest in major Saudi healthcare companies, 2024",
    source: "AGBI, Oct 2024", href: "https://www.agbi.com/analysis/health/2024/10/healthcare-sector-next-target-for-saudi-private-equity/",
  },
  {
    value: "$57B", label: "Saudi government health & social development budget for 2024 (SAR 214B)",
    source: "AGBI, Oct 2024", href: "https://www.agbi.com/analysis/health/2024/10/healthcare-sector-next-target-for-saudi-private-equity/",
  },
  {
    value: "$4.4B", label: "Saudi digital health market size, 2025 — projected to reach $18.3B by 2032",
    source: "PS Market Research", href: "https://www.psmarketresearch.com/market-analysis/saudi-arabia-digital-health-market-report",
  },
] as const;

function HealthcareInvestments() {
  const { data: STARTUPS } = useStartups();
  const total = STARTUPS.reduce((a, s) => a + s.fundingTotal, 0);
  return (
    <div className="panel mt-32">
      <div className="panel-head"><h3>Healthcare Ecosystem Investments</h3><span className="sub">{STARTUPS.length === 0 ? "Saudi Arabia market context" : "Last 90 days"}</span></div>
      <div className="panel-pad">
        {STARTUPS.length === 0 ? (
          <MarketInvestmentContext />
        ) : (
          <>
            <EcoStackBar />
            <div className="trend-total"><b className="mono">SAR {total.toFixed(1)}M</b><span>Public &amp; private investments — trending healthcare</span></div>
            <div className="trend-companies">
              {STARTUPS.slice(0, 6).map((s) => (
                <div className="trend-co" key={s.id}><div className="tlogo">{s.logo}</div><b>{s.name}</b><span>SAR {s.fundingTotal}M</span></div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MarketInvestmentContext() {
  return (
    <div>
      <div className="market-stat-grid">
        {MARKET_INVESTMENT_STATS.map((s) => (
          <a key={s.value + s.label} href={s.href} target="_blank" rel="noreferrer" className="market-stat">
            <b className="mono">{s.value}</b>
            <span>{s.label}</span>
            <span className="market-stat-src">Source: {s.source}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function EcoStackBar() {
  const { data: STARTUPS } = useStartups();
  const vals = STACK_CATS.map((c) =>
    STARTUPS.filter((s) => s.category === c || (c === "Other" && !["Biotechnology", "Digital Health", "Medical Devices", "Diagnostics", "AI Healthcare", "Pharmaceuticals"].includes(s.category)))
      .reduce((a, s) => a + s.fundingTotal, 0),
  );
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  return (
    <>
      <div className="stack-bar">
        {STACK_CATS.map((c, i) => vals[i] ? <span key={c} style={{ width: `${(vals[i] / total) * 100}%`, background: STACK_COLORS[i] }} /> : null)}
      </div>
      <div className="stack-legend">
        {STACK_CATS.map((c, i) => vals[i] ? <span key={c}><i style={{ background: STACK_COLORS[i] }} />{c}</span> : null)}
      </div>
    </>
  );
}

function EcosystemDashboard({ loggedIn }: { loggedIn: boolean }) {
  const { data: EVENTS } = useEvents();
  const { data: NEWS } = useNews();
  const { hydrated } = useSession();
  // Same source as the News & Events page; anything already over is left out.
  const current = EVENTS.filter((e) => eventStatusOf(e.startDate, e.endDate) !== "PAST").sort(compareEvents);
  const latestNews = [...NEWS].sort((a, b) => (a.publishedDate < b.publishedDate ? 1 : -1));
  return (
    <div className="intel-grid mt-16">
      <div className="panel intel-events">
        <div className="panel-head"><h3>Upcoming Events</h3></div>
        <div className="panel-pad">
          {current.length === 0 && <div className="small muted">No upcoming events yet.</div>}
          {current.slice(0, 3).map((e) => (
            <div className="event-item" key={e.id}>
              <div className="ev-cat">{e.type}{eventStatusOf(e.startDate, e.endDate) === "ONGOING" ? " · ONGOING" : ""}</div>
              <h5>{safeHttpUrl(e.url) ? <a href={safeHttpUrl(e.url)!} target="_blank" rel="noopener noreferrer" className="news-title-link">{e.name}</a> : e.name}</h5>
              <div className="ev-meta"><span>{formatEventDates(e.startDate, e.endDate)}</span>{(e.city || e.country) && <><span>·</span><span>{[e.city, e.country].filter(Boolean).join(", ")}</span></>}</div>
              {e.description && <div className="ev-meta ev-desc">{e.description}</div>}
              <div className="ev-actions">
                <AddToCalendar event={e} variant="link" />
                {safeHttpUrl(e.url) && <a className="ev-link" href={safeHttpUrl(e.url)!} target="_blank" rel="noopener noreferrer">View Event →</a>}
              </div>
            </div>
          ))}
          <Link href="/news" className="ev-link">View All Events →</Link>
        </div>
      </div>

      <div className="intel-center">
        {!hydrated ? (
          <div className="panel panel-pad">
            <h3 className="fs-14 mb-8">Recommended For You</h3>
            <div className="locked-teaser" aria-hidden="true">
              <div className="lt-bars">{[88, 74, 60, 82].map((w, i) => <div key={i} className="lt-bar" style={{ width: `${w}%` }} />)}</div>
            </div>
          </div>
        ) : loggedIn ? (
          <RecommendedPanels />
        ) : (
          <div className="panel panel-pad">
            <h3 className="fs-14 mb-8">Recommended For You</h3>
            <LockedTeaser
              title="Unlock Personalized Recommendations"
              body="Sign in to see startups and investors recommended based on your interests."
              blurLines={4}
              cta="Sign in to unlock"
            />
          </div>
        )}
      </div>

      <div className="panel intel-news">
        <div className="panel-head"><h3>Latest Healthcare News</h3></div>
        <div className="panel-pad">
          {NEWS.length === 0 && <div className="small muted">No news yet.</div>}
          {latestNews.slice(0, 6).map((n) => (
            <div className="news-item" key={n.id}>
              <div className="n-date">{n.publishedDate.slice(5).replace("-", "/")}</div>
              <div>
                <h5>{safeHttpUrl(n.sourceUrl) ? <a href={safeHttpUrl(n.sourceUrl)!} target="_blank" rel="noopener noreferrer" className="news-title-link">{n.title}</a> : n.title}</h5>
                <div className="n-src">{n.source}</div>
              </div>
            </div>
          ))}
          <Link href="/news" className="ev-link">View All News →</Link>
        </div>
      </div>
    </div>
  );
}

function RecommendedPanels() {
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();
  // Interest-based personalization isn't tracked by the backend account
  // model — this always falls back to the unweighted top startups, same as
  // it did for every non-demo account before this page was backend-wired.
  const interests: string[] = [];
  const scored = STARTUPS.map((s) => ({ s, hit: interests.includes(s.category) ? 1 : 0 }));
  scored.sort((a, b) => b.hit - a.hit);
  const recommendedStartups = scored.slice(0, 3).map((x) => x.s);

  return (
    <>
      <div className="panel">
        <div className="panel-head"><h3>Recommended Startups</h3><span className="sub">Based on your interests</span></div>
        <div className="panel-pad">
          {recommendedStartups.length ? (
            <div className="entity-grid dash-rec-grid">
              {recommendedStartups.map((s) => (
                <EntityCard
                  key={s.id} href={`/startups/${s.id}`} logo={s.logo} logoUrl={s.logoUrl} name={s.name} subtitle={`${s.city} · ${s.category}`}
                  desc={s.tagline} kind="startups" id={s.id}
                  meta={<><span className={`badge ${regBadgeClass(s.regulatory.sfda)}`}>{s.regulatory.sfda}</span><span className="tag">{s.stage}</span></>}
                  foot={<><span className="escore">{s.score}</span><span className="small muted">RUWĀD Score</span></>}
                />
              ))}
            </div>
          ) : (
            <p className="muted small">No startup recommendations available yet.</p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Recommended Investors</h3></div>
        <div className="panel-pad">
          {INVESTORS.length ? (
            <div className="entity-grid dash-rec-grid">
              {INVESTORS.slice(0, 3).map((v) => (
                <EntityCard
                  key={v.id} href={`/investors/${v.id}`} logo={v.logo} logoUrl={v.logoUrl} logoStyle={{ background: "var(--navy-900)", color: "#fff" }}
                  name={v.name} subtitle={`${v.city} · ${v.type}`} desc={v.desc} kind="investors" id={v.id}
                  meta={<><span className="tag">{v.ticket}</span><span className="tag">{v.hcFocus.length} focus areas</span></>}
                  foot={<span className="small muted">{v.portfolio.length} in portfolio</span>}
                />
              ))}
            </div>
          ) : (
            <p className="muted small">No investor recommendations available yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
