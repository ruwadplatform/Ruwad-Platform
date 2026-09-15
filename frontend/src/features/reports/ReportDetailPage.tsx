"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import { EntityCard } from "@/components/shared/EntityCard";
import { ReportCard } from "@/components/intelligence/ReportCard";
import { ReportBadges } from "@/components/intelligence/ReportBadges";
import { KpiCard } from "@/components/intelligence/KpiCard";
import { InsightCard } from "@/components/intelligence/InsightCard";
import { BarChart } from "@/components/intelligence/BarChart";
import { DataSourceLabel } from "@/components/intelligence/DataSourceLabel";
import { LockedTeaser } from "@/components/shared/LockedTeaser";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import type { Report, ReportSection } from "@/types/intelligence";

/** A single-card gate for logged-in-only content within an otherwise-visible
 * section — same pattern AnalyticsDetailPage's local `Gated` uses, kept
 * page-local here too rather than promoted to a shared component (it's a
 * 3-line LockedTeaser wrapper, not something worth a new file). */
function Gated({ loggedIn, hydrated, title, body, children }: { loggedIn: boolean; hydrated: boolean; title: string; body: string; children: ReactNode }) {
  // Session check still in flight — show neither the real content nor the
  // guest-specific "Sign in to unlock" CTA (loggedIn defaults to false
  // until hydrated, so showing the teaser here would flash it at an
  // authenticated visitor on every refresh). Same bars LockedTeaser itself
  // renders, just without the CTA that asserts a guest state we don't know yet.
  if (!hydrated) {
    return (
      <div className="locked-teaser" aria-hidden="true">
        <div className="lt-bars">{[88, 74, 60].map((w, i) => <div key={i} className="lt-bar" style={{ width: `${w}%` }} />)}</div>
      </div>
    );
  }
  if (loggedIn) return <>{children}</>;
  return <LockedTeaser title={title} body={body} blurLines={3} cta="Unlock Full Report" />;
}

/** Purely decorative icon choice for a Key Insight card, derived from
 * keywords already present in the finding's own text — never adds or
 * implies content beyond what the finding already says. */
function insightIcon(text: string): RuwadIconName {
  const t = text.toLowerCase();
  if (/invest|fund|capital|venture|deal/.test(t)) return "investors";
  if (/regulat|sfda|sandbox|approv|compliance/.test(t)) return "lock";
  if (/government|vision 2030|national|policy|public/.test(t)) return "building";
  if (/ai|digital|technology|data|platform/.test(t)) return "bi";
  if (/patient|clinical|hospital|care/.test(t)) return "research";
  return "sparkle";
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="fs-19 mb-16" style={{ fontWeight: 700 }}>{children}</h2>;
}

export function ReportDetailPage({ report: r }: { report: Report }) {
  const router = useRouter();
  const toast = useToast();
  const { loggedIn, hydrated } = useSession();

  const relatedCompanies = r.relatedCompaniesDetailed ?? [];
  const relatedInvestors = r.relatedInvestorsDetailed ?? [];
  const relatedReports = r.relatedReportsDetailed ?? [];
  const chartSections = r.sections.filter((s) => (s.chart?.length ?? 0) > 0);
  // While the session check is still in flight, default to the guest-
  // capped view (fewer findings) rather than guessing logged-in — under-
  // showing real content for ~100ms is harmless; over-showing gated
  // content to a guest, even briefly, is not.
  const unlocked = hydrated && loggedIn;
  const visibleFindings = unlocked ? r.keyFindings : r.keyFindings.slice(0, 2);
  const lockedFindingsCount = r.keyFindings.length - visibleFindings.length;
  // Only treat the last section as a distinct "Outlook" narrative when the
  // report actually has more than one section — a single-section report
  // has nothing separate to say twice.
  const outlookSection: ReportSection | null = r.sections.length > 1 ? r.sections[r.sections.length - 1] : null;
  const opportunityFindings = unlocked ? r.keyFindings.slice(0, 3) : r.keyFindings.slice(0, 2);

  function shareLink() {
    const url = `${location.origin}/reports/${r.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast("Report link copied to clipboard"), () => toast(url));
    } else {
      toast(url);
    }
  }

  return (
    <div className="report-page">
      <button className="btn btn-ghost btn-sm mb-16" onClick={() => router.push("/reports")}>← Back to Reports</button>

      {/* ============================================================ HERO */}
      <div className="report-hero">
        <div className="report-hero-top">
          <div className="flex" style={{ gap: 18, alignItems: "flex-start", flex: 1, minWidth: 280 }}>
            <div className="report-hero-icon"><RuwadIcon name="reports" size={24} /></div>
            <div className="report-hero-main">
              <div className="eyebrow brand">{r.category} · {r.reportType}</div>
              <h1>{r.title}</h1>
              <p className="report-hero-desc">{r.description}</p>
              <div className="mt-12"><ReportBadges badges={r.badges} /></div>
              <div className="profile-meta mt-12">
                <span><RuwadIcon name="map" size={13} /> {r.geography}</span>
                <span><RuwadIcon name="research" size={13} /> {r.sector}</span>
                <span><RuwadIcon name="clock" size={13} /> {r.publicationDate}</span>
                <span><RuwadIcon name="clock" size={13} /> {r.readingTime}</span>
                <span><RuwadIcon name="doc" size={13} /> {r.pages} pages</span>
                {r.authors.length > 0 && <span><RuwadIcon name="user" size={13} /> {r.authors.join(", ")}</span>}
              </div>
            </div>
          </div>
          <div className="report-hero-actions">
            <button className="btn btn-outline btn-sm" onClick={shareLink}><RuwadIcon name="globe" size={13} /> Share</button>
          </div>
        </div>
      </div>

      {/* =========================================================== KPIs */}
      {r.marketStats.length > 0 && (
        <div className="kpi-row mb-24">
          {r.marketStats.map((s) => <KpiCard key={s.label} label={s.label} value={s.value} />)}
        </div>
      )}

      {/* ================================================ MARKET SNAPSHOT */}
      {chartSections.length > 0 && (
        <div className="mb-24">
          <SectionTitle>Market Snapshot</SectionTitle>
          <div className="insight-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {chartSections.map((s, i) => {
              const card = <InsightCard title={s.heading}><BarChart data={s.chart!} /><DataSourceLabel /></InsightCard>;
              if (i === 0) return <div key={s.heading}>{card}</div>;
              return (
                <div key={s.heading}>
                  <Gated loggedIn={loggedIn} hydrated={hydrated} title="Unlock Full Market Snapshot" body={`Sign in to see ${chartSections.length - 1} more chart${chartSections.length - 1 === 1 ? "" : "s"} from this report's market data.`}>
                    {card}
                  </Gated>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =================================================== KEY INSIGHTS */}
      <div className="mb-24">
        <SectionTitle>Key Insights</SectionTitle>
        <div className="insight-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
          {visibleFindings.map((f) => (
            <div className="insight-card" key={f}>
              <div className="ic-icon"><RuwadIcon name={insightIcon(f)} size={16} /></div>
              <p style={{ fontSize: "var(--fs-13)", color: "var(--text)" }}>{f}</p>
            </div>
          ))}
        </div>
        {hydrated && !loggedIn && lockedFindingsCount > 0 && (
          <div className="mt-12">
            <LockedTeaser preview={`${lockedFindingsCount} more finding${lockedFindingsCount === 1 ? "" : "s"}`} title="Unlock the Full Report" body="Sign in to read every key finding, market statistic and the full analysis in this report." blurLines={2} cta="Unlock Full Report" />
          </div>
        )}
      </div>

      {/* ======================================================= ANALYSIS */}
      <div className="mb-24">
        <SectionTitle>Analysis</SectionTitle>
        <Gated loggedIn={loggedIn} hydrated={hydrated} title="Unlock Full Analysis" body="Sign in to read this report's full sector, funding and regulatory analysis.">
          <div className="insight-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
            {/* The last section is broken out as "Outlook" below instead of
               repeated here, when the report has more than one section. */}
            {(outlookSection ? r.sections.slice(0, -1) : r.sections).map((s) => (
              <div className="panel panel-pad" key={s.heading}>
                <h3 className="fs-14 mb-8">{s.heading}</h3>
                <p className="fs-13" style={{ lineHeight: "var(--line-height-relaxed)", color: "var(--text)" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </Gated>
      </div>

      {/* ==================================================== OPPORTUNITIES */}
      {(outlookSection || opportunityFindings.length > 0) && (
        <div className="mb-24">
          <SectionTitle>Opportunities &amp; Outlook</SectionTitle>
          <div className="insight-row" style={{ gridTemplateColumns: outlookSection ? "1fr 1fr" : "1fr" }}>
            {outlookSection && (
              <div className="panel panel-pad">
                <div className="eyebrow brand mb-8">Outlook</div>
                <h3 className="fs-14 mb-8">{outlookSection.heading}</h3>
                <Gated loggedIn={loggedIn} hydrated={hydrated} title="Unlock the Full Outlook" body="Sign in to read this report's forward-looking analysis.">
                  <p className="fs-13" style={{ lineHeight: "var(--line-height-relaxed)", color: "var(--text)" }}>{outlookSection.body}</p>
                </Gated>
              </div>
            )}
            {opportunityFindings.length > 0 && (
              <div className="panel panel-pad">
                <div className="eyebrow brand mb-8">Opportunity Signals</div>
                <div className="flex" style={{ flexDirection: "column", gap: 12 }}>
                  {opportunityFindings.map((f) => (
                    <div className="flex gap-8" key={f} style={{ alignItems: "flex-start" }}>
                      <RuwadIcon name="arrow" size={14} />
                      <p className="fs-13" style={{ margin: 0 }}>{f}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================== RELATED COMPANIES */}
      <div className="mb-24">
        <SectionTitle>Companies to Watch</SectionTitle>
        {!relatedCompanies.length ? <p className="small muted">No related companies for this report.</p> : (
          <div className="entity-grid">
            {relatedCompanies.map((s) => (
              <EntityCard key={s.id} href={`/startups/${s.slug}`} logo={s.logo} logoUrl={s.logoUrl} name={s.name} subtitle={`${s.city} · ${s.category}`} desc={s.tagline} kind="startups" id={s.slug}
                meta={<><span className="tag">{s.stage}</span></>} foot={<span className="small muted">SAR {s.fundingTotal}M raised</span>} />
            ))}
          </div>
        )}
      </div>

      {/* ============================================== RELATED INVESTORS */}
      <div className="mb-24">
        <SectionTitle>Relevant Investors</SectionTitle>
        {!relatedInvestors.length ? <p className="small muted">No related investors for this report.</p> : (
          <div className="entity-grid">
            {relatedInvestors.map((v) => (
              <EntityCard key={v.id} href={`/investors/${v.slug}`} logo={v.logo} logoUrl={v.logoUrl} logoStyle={{ background: "var(--navy-900)", color: "#fff" }} name={v.name} subtitle={`${v.city} · ${v.type}`} desc={v.desc} kind="investors" id={v.slug}
                meta={<><span className="tag">{v.ticket}</span></>} foot={<span className="small muted">{v.hcDeals} healthcare deals</span>} />
            ))}
          </div>
        )}
      </div>

      {relatedReports.length > 0 && (
        <div className="mb-24">
          <SectionTitle>Related Reports</SectionTitle>
          <div className="entity-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
            {relatedReports.map((x) => <ReportCard key={x.id} report={x} />)}
          </div>
        </div>
      )}

      {/* ========================================= SOURCES & METHODOLOGY */}
      <details className="report-sources">
        <summary>
          <span className="fs-13" style={{ fontWeight: 600 }}>Sources &amp; Methodology</span>
          <RuwadIcon name="chevron" size={14} />
        </summary>
        <div className="report-sources-body">
          <ul className="fs-12" style={{ paddingLeft: 18, color: "var(--muted)", lineHeight: "var(--line-height-relaxed)" }}>
            {r.sources.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      </details>
    </div>
  );
}
