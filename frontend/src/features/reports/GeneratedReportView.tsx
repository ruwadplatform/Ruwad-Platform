"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/intelligence/KpiCard";
import { BarChart } from "@/components/intelligence/BarChart";
import type { Report, ReportExternalSource } from "@/types/intelligence";
import { ReportAdminBar } from "./ReportAdminPanel";

/** A report built from RUWĀD's own data plus stored web research. One continuous page — no tabs.
 * Everything from RUWĀD's database is labelled as such, and every web finding is labelled as an external source. */

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const SECTOR_TOPICS = new Set(["overview", "government", "international", "market-study", "regulation", "company"]);
const FUNDING_TOPICS = new Set(["funding", "investment"]);

function Section({ n, title, children, id }: { n: number; title: string; children: ReactNode; id: string }) {
  return (
    <section id={id} className="mb-32" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="fs-19 mb-16" style={{ fontWeight: 700 }}>{n}. {title}</h2>
      {children}
    </section>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone: "internal" | "external" }) {
  return <span className={`badge ${tone === "internal" ? "badge-good" : "badge-warn"}`}>{children}</span>;
}

function SourceList({ items, empty }: { items: ReportExternalSource[]; empty: string }) {
  if (!items.length) return <p className="muted fs-13">{empty}</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
      {items.map((s) => (
        <li key={s.id} className="panel panel-pad">
          <div className="fs-11 muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Tag tone="external">External source</Tag>
            <span>{s.sourceTypeLabel}</span><span>· {s.domain}</span>
            {s.publishedAt || s.publishedText ? <span>· {s.publishedAt ? fmtDate(s.publishedAt) : s.publishedText}</span> : null}
          </div>
          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, display: "block", marginTop: 6 }}>{s.title}</a>
          {s.snippet ? <p className="fs-13 muted" style={{ marginTop: 4 }}>{s.snippet}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function GeneratedReportView({ report: r }: { report: Report }) {
  const g = r.generated!;
  const st = g.internalStats;
  const src = g.externalSources;
  const sectorSrc = src.filter((s) => SECTOR_TOPICS.has(s.topic));
  const fundingSrc = src.filter((s) => FUNDING_TOPICS.has(s.topic));
  const newsSrc = src.filter((s) => s.topic === "news");
  const startupDists = st.distributions.filter((d) => ["stage", "city", "sector"].includes(d.key));
  const fundingDists = st.distributions.filter((d) => d.key === "fundingByStage");
  const investorDists = st.distributions.filter((d) => ["investorType", "investorStages"].includes(d.key));
  const fundingMetrics = st.metrics.filter((m) => /fund|raise|valuation|SAR|round/i.test(m.label));
  const investorMetrics = st.metrics.filter((m) => /investor|deal/i.test(m.label));
  const lines = g.aiOverview ? [g.aiOverview] : g.overviewLines;
  const notice = g.research.status === "ok" ? null : g.research.status;

  return (
    <div className="content-in wide" style={{ maxWidth: 980 }}>
      <nav className="fs-12 muted mb-16"><Link href="/reports">Reports</Link> / {r.title}</nav>

      {/* 1. Title */}
      <header className="mb-24">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {r.isPublished === false ? <span className="badge badge-warn">Draft — not visible to the public</span> : <span className="badge badge-good">Published</span>}
          <span className="badge">{r.reportType}</span>
          <span className="badge">{g.scopeLabel}</span>
        </div>
        <h1 className="fs-28" style={{ fontWeight: 800 }}>{r.title}</h1>
        <p className="muted fs-13 mt-8">
          RUWĀD data as of {fmtDate(st.coverage.asOf)}
          {g.researchedAt ? ` · external research retrieved ${fmtDate(g.researchedAt)}` : " · no external research"}
        </p>
        <ReportAdminBar report={r} />
      </header>

      {notice && (
        <div className="panel panel-pad mb-24" role="status" style={{ borderColor: "var(--warn)" }}>
          <strong className="fs-13">{notice === "disabled" ? "External research is switched off" : notice === "unavailable" ? "External research was unavailable" : "External research was only partly available"}</strong>
          <p className="fs-13 muted mt-8">{g.research.note ?? "Sections that need web sources may be thin. RUWĀD figures below are unaffected."}</p>
        </div>
      )}

      {/* 2. Executive overview */}
      <Section n={2} id="overview" title="Executive overview">
        <div className="panel panel-pad">
          {g.aiOverview && <p className="fs-12 muted mb-8">AI-assisted summary — every figure in it is taken from the RUWĀD data below.</p>}
          <ul style={{ paddingLeft: 18, display: "grid", gap: 8, margin: 0 }}>{lines.map((l, i) => <li key={i} className="fs-14">{l}</li>)}</ul>
        </div>
      </Section>

      {/* 3. RUWĀD key metrics */}
      <Section n={3} id="metrics" title="RUWĀD key metrics">
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Counted from the RUWĀD platform database — not from web sources.</p>
        <div className="kpi-row">{st.metrics.map((m) => <KpiCard key={m.label} label={m.label} value={m.value} delta={m.note} />)}</div>
        {st.subject && (
          <div className="mt-16">
            <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>{st.subject.name}</h3>
            <div className="kpi-row">{st.subject.facts.map((m) => <KpiCard key={m.label} label={m.label} value={m.value} />)}</div>
            {st.subject.peers.length > 0 && <div className="kpi-row mt-12">{st.subject.peers.map((m) => <KpiCard key={m.label} label={`Peers: ${m.label}`} value={m.value} />)}</div>}
          </div>
        )}
      </Section>

      {/* 4. Sector / ecosystem overview */}
      <Section n={4} id="sector" title="Sector and ecosystem overview">
        <p className="fs-12 muted mb-12">Government, international-body and industry sources found by web search.</p>
        <SourceList items={sectorSrc} empty="No qualifying external sources were found for this section." />
      </Section>

      {/* 5. Startup landscape */}
      <Section n={5} id="startups" title="Startup landscape">
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag></p>
        {startupDists.length ? (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            {startupDists.map((d) => <div key={d.key} className="panel panel-pad"><h4 className="fs-13 mb-12">{d.title}</h4><BarChart data={d.rows} unit={d.unit} /></div>)}
          </div>
        ) : <p className="muted fs-13">No startup distribution applies to this report.</p>}
      </Section>

      {/* 6. Funding landscape */}
      <Section n={6} id="funding" title="Funding landscape">
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Recorded funding on RUWĀD profiles; it may not be the complete market.</p>
        {fundingMetrics.length > 0 && <div className="kpi-row mb-16">{fundingMetrics.map((m) => <KpiCard key={m.label} label={m.label} value={m.value} delta={m.note} />)}</div>}
        {fundingDists.map((d) => <div key={d.key} className="panel panel-pad mb-16"><h4 className="fs-13 mb-12">{d.title}</h4><BarChart data={d.rows} unit={d.unit} /></div>)}
        <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Funding coverage from external sources</h3>
        <SourceList items={fundingSrc} empty="No credible external funding sources were found." />
      </Section>

      {/* 7. Investor landscape */}
      <Section n={7} id="investors" title="Investor landscape">
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag></p>
        {investorMetrics.length > 0 && <div className="kpi-row mb-16">{investorMetrics.map((m) => <KpiCard key={m.label} label={m.label} value={m.value} />)}</div>}
        {investorDists.length > 0 && (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            {investorDists.map((d) => <div key={d.key} className="panel panel-pad"><h4 className="fs-13 mb-12">{d.title}</h4><BarChart data={d.rows} unit={d.unit} /></div>)}
          </div>
        )}
        {st.investors.length > 0 && (
          <ul className="mt-16" style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {st.investors.map((v) => <li key={v.slug} className="panel panel-pad fs-13"><Link href={`/investors/${v.slug}`} style={{ fontWeight: 600 }}>{v.name}</Link> · {v.type}{v.city ? ` · ${v.city}` : ""} · {v.hcDeals} healthcare deals</li>)}
          </ul>
        )}
        {!investorDists.length && !st.investors.length && <p className="muted fs-13">No investor data applies to this report.</p>}
      </Section>

      {/* 8. Current external developments */}
      <Section n={8} id="developments" title="Current external developments">
        <p className="fs-12 muted mb-12">Recent news found by web search. Read the original article before relying on it.</p>
        <SourceList items={newsSrc} empty="No recent external developments were found." />
      </Section>

      {/* 9. Relevant companies */}
      <Section n={9} id="companies" title="Relevant companies">
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Companies listed on RUWĀD.</p>
        {st.companies.length ? (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {st.companies.map((c) => <li key={c.slug} className="panel panel-pad fs-13"><Link href={`/startups/${c.slug}`} style={{ fontWeight: 600 }}>{c.name}</Link> · {c.category} · {c.stage}{c.city ? ` · ${c.city}` : ""}</li>)}
          </ul>
        ) : <p className="muted fs-13">No companies matched this scope.</p>}
      </Section>

      {/* 10. Sources */}
      <Section n={10} id="sources" title="Sources">
        <p className="fs-12 muted mb-12">{src.length} external source{src.length === 1 ? "" : "s"}, ranked by reliability (Saudi government first, then official sites, international bodies, consultancies, news). Links open the original page.</p>
        {src.length ? (
          <div className="panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left" }}><th style={{ padding: 10 }}>Source</th><th>Type</th><th>Published</th><th>Retrieved</th><th>Search query</th></tr></thead>
              <tbody>
                {src.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: 10 }}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a><div className="muted">{s.domain}</div></td>
                    <td>{s.sourceTypeLabel}</td>
                    <td>{s.publishedAt ? fmtDate(s.publishedAt) : s.publishedText ?? "—"}</td>
                    <td>{fmtDate(s.retrievedAt)}</td>
                    <td className="muted">{s.query}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted fs-13">No external sources are attached to this report.</p>}
      </Section>

      {/* 11. Methodology */}
      <Section n={11} id="methodology" title="Methodology">
        <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>{g.methodology.map((m, i) => <li key={i} className="fs-13">{m}</li>)}</ul>
        <p className="fs-12 muted mt-8">{g.research.searchesUsed} web search{g.research.searchesUsed === 1 ? "" : "es"} run, {g.research.cacheHits} answered from saved results, {g.research.sourcesKept} sources kept.</p>
      </Section>

      {/* 12. Data coverage notice */}
      <Section n={12} id="coverage" title="Data coverage notice">
        <div className="panel panel-pad"><p className="fs-13">{g.coverageNotice}</p></div>
      </Section>
    </div>
  );
}
