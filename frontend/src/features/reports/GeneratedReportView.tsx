"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/intelligence/KpiCard";
import { BarChart } from "@/components/intelligence/BarChart";
import type { Report, ReportExternalSource, ReportMetric } from "@/types/intelligence";
import { ReportAdminBar } from "./ReportAdminPanel";

/** A report built from RUWĀD's own data plus stored web research. One continuous page — no tabs.
 * Everything from RUWĀD's database is labelled as such, and every web finding is labelled as an external source.
 * Sections with nothing to show are left out rather than filled with placeholders. */

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const MARKET_TOPICS = new Set(["overview", "international", "market-study", "company"]);
const FUNDING_TOPICS = new Set(["funding", "investment"]);
const HEADLINE = new Set(["Startups on RUWĀD", "Investors on RUWĀD", "Total recorded funding", "Active funding rounds", "Companies with recorded funding", "Research institutions", "Hubs & enablers", "Multinationals"]);
const FUNDING_RE = /fund|raise|round|valuation/i;
const INVESTOR_RE = /investor|deal|ticket|exit|investment/i;
const STARTUP_DISTS = ["stage", "city", "country", "foundingYear", "sector"];
const FUNDING_DISTS = ["fundingByStage", "fundingBySector", "fundingByCompany"];
const INVESTOR_DISTS = ["investorType", "investorStages", "investorSectors", "investorTicket", "investorCity"];

function Tag({ children, tone }: { children: ReactNode; tone: "internal" | "external" }) {
  return <span className={`badge ${tone === "internal" ? "badge-good" : "badge-warn"}`}>{children}</span>;
}

function Kpis({ items }: { items: ReportMetric[] }) {
  return <div className="kpi-row">{items.map((m) => <KpiCard key={m.label} label={m.label} value={m.value} delta={m.note} />)}</div>;
}

function Charts({ dists }: { dists: NonNullable<Report["generated"]>["internalStats"]["distributions"] }) {
  if (!dists.length) return null;
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))" }}>
      {dists.map((d) => (
        <div key={d.key} className="panel panel-pad" style={{ minWidth: 0 }}>
          <h4 className="fs-13 mb-12">{d.title}</h4>
          <BarChart data={d.rows} unit={d.unit === "SAR M" ? "M" : undefined} />
        </div>
      ))}
    </div>
  );
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
          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, display: "block", marginTop: 6, overflowWrap: "anywhere" }}>{s.title}</a>
          {s.snippet ? <p className="fs-13 muted" style={{ marginTop: 4 }}>{s.snippet}</p> : null}
        </li>
      ))}
    </ul>
  );
}

const byNewest = (a: ReportExternalSource, b: ReportExternalSource) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
const money = (m: number) => (m > 0 ? `SAR ${m}M` : "—");

export function GeneratedReportView({ report: r }: { report: Report }) {
  const [published, setPublished] = useState(r.isPublished !== false);
  const g = r.generated!;
  const st = g.internalStats;
  const subject = st.subject;
  const src = g.externalSources;
  const notice = g.research.status === "ok" ? null : g.research.status;
  const lines = g.aiOverview ? [g.aiOverview] : g.overviewLines;

  const headline = subject ? st.metrics : st.metrics.filter((m) => HEADLINE.has(m.label));
  const detail = subject ? [] : st.metrics.filter((m) => !HEADLINE.has(m.label));
  const fundingDetail = detail.filter((m) => FUNDING_RE.test(m.label));
  const investorDetail = detail.filter((m) => !FUNDING_RE.test(m.label) && INVESTOR_RE.test(m.label));
  const startupDetail = detail.filter((m) => !fundingDetail.includes(m) && !investorDetail.includes(m));
  const dists = (keys: string[]) => keys.map((k) => st.distributions.find((d) => d.key === k)).filter((d): d is NonNullable<typeof d> => !!d);
  const startupDists = dists(STARTUP_DISTS);
  const fundingDists = dists(FUNDING_DISTS);
  const investorDists = dists(INVESTOR_DISTS);

  const govSrc = src.filter((s) => s.sourceType === "government" || s.topic === "government" || s.topic === "regulation");
  const marketSrc = src.filter((s) => MARKET_TOPICS.has(s.topic) && !govSrc.includes(s));
  const fundingSrc = src.filter((s) => FUNDING_TOPICS.has(s.topic)).sort(byNewest);
  const newsSrc = src.filter((s) => s.topic === "news").sort(byNewest);
  const developments = subject ? [...fundingSrc, ...newsSrc].sort(byNewest) : newsSrc;
  const ms = g.marketSize;
  const sought = st.fundingSought ?? [];

  const sections: { id: string; title: string; body: ReactNode }[] = [];
  const add = (id: string, title: string, body: ReactNode) => sections.push({ id, title, body });

  add("overview", "Executive overview", (
    <div className="panel panel-pad">
      {g.aiOverview && <p className="fs-12 muted mb-8">AI-assisted summary — every figure in it is taken from the RUWĀD data below.</p>}
      <ul style={{ paddingLeft: 18, display: "grid", gap: 8, margin: 0 }}>{lines.map((l, i) => <li key={i} className="fs-14">{l}</li>)}</ul>
    </div>
  ));

  if (headline.length || subject) {
    add("metrics", "Key metrics", (
      <>
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Counted from the RUWĀD platform database — not from web sources.</p>
        {headline.length > 0 && <Kpis items={headline} />}
        {subject && (
          <div className="mt-16">
            <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>{subject.name}</h3>
            <Kpis items={subject.facts} />
            {subject.peers.length > 0 && <div className="mt-12"><Kpis items={subject.peers.map((m) => ({ ...m, label: `Peers: ${m.label}` }))} /></div>}
          </div>
        )}
      </>
    ));
  }

  if (ms) {
    add("market-size", "Market size", (
      <>
        <p className="fs-12 muted mb-12"><Tag tone="external">External source</Tag> &nbsp;RUWĀD does not estimate market size. A figure appears only when a credible source states it, with its year, geography and currency.</p>
        {ms.status === "found" ? (
          <div style={{ display: "grid", gap: 12 }}>
            {ms.claims.map((c) => (
              <div key={`${c.sourceId}-${c.amount}-${c.year}`} className="panel panel-pad">
                <div style={{ fontSize: "var(--fs-22)", fontWeight: 800 }}>{c.currency} {c.amount}</div>
                <div className="fs-13 muted mt-4">{c.geography} · {c.year} · {c.basis === "projected" ? "projection stated by the source" : "figure stated by the source"}</div>
                <p className="fs-13 mt-8" style={{ fontStyle: "italic" }}>“{c.quote}”</p>
                <p className="fs-12 muted mt-8">Source: <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{c.sourceTitle}</a> ({c.sourceTypeLabel}, {c.domain})</p>
              </div>
            ))}
          </div>
        ) : <div className="panel panel-pad"><p className="fs-13">{ms.message}</p></div>}
      </>
    ));
  }

  if (govSrc.length) {
    add("initiatives", "Government and ecosystem initiatives", (
      <>
        <p className="fs-12 muted mb-12">Ministry, regulator and national-programme sources (for example MOH, SFDA, Vision 2030, Monsha&apos;at, MISA, PIF) found by web search.</p>
        <SourceList items={govSrc} empty="" />
      </>
    ));
  }

  if (marketSrc.length) {
    add("sector", "Market and ecosystem overview", (
      <>
        <p className="fs-12 muted mb-12">Current findings from international bodies, research firms and official sites.</p>
        <SourceList items={marketSrc} empty="" />
      </>
    ));
  }

  if (startupDists.length || startupDetail.length) {
    add("startups", "Startup landscape", (
      <>
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag></p>
        {startupDetail.length > 0 && <div className="mb-16"><Kpis items={startupDetail} /></div>}
        <Charts dists={startupDists} />
      </>
    ));
  }

  if (fundingDists.length || fundingDetail.length || sought.length || fundingSrc.length) {
    add("funding", "Funding landscape", (
      <>
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Funding raised, as recorded on RUWĀD company profiles (SAR millions). It may not be the complete market.</p>
        {fundingDetail.length > 0 && <div className="mb-16"><Kpis items={fundingDetail} /></div>}
        <Charts dists={fundingDists} />
        {sought.length > 0 && (
          <div className="mt-16">
            <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Funding being sought</h3>
            <p className="fs-12 muted mb-8"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Targets these companies state they are raising. This is not money raised.</p>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, margin: 0 }}>
              {sought.map((c) => <li key={c.slug} className="panel panel-pad fs-13"><Link href={`/startups/${c.slug}`} style={{ fontWeight: 600 }}>{c.name}</Link> · {c.stage} · seeking {c.target}</li>)}
            </ul>
          </div>
        )}
        {fundingSrc.length > 0 && (
          <div className="mt-16">
            <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Funding coverage from external sources</h3>
            <SourceList items={fundingSrc} empty="" />
          </div>
        )}
      </>
    ));
  }

  if (investorDists.length || investorDetail.length || st.investors.length) {
    add("investors", "Investor landscape", (
      <>
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Ticket size and sector focus are shown only where investors have recorded them.</p>
        {investorDetail.length > 0 && <div className="mb-16"><Kpis items={investorDetail} /></div>}
        <Charts dists={investorDists} />
        {st.investors.length > 0 && (
          <ul className="mt-16" style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, margin: 0 }}>
            {st.investors.map((v) => <li key={v.slug} className="panel panel-pad fs-13"><Link href={`/investors/${v.slug}`} style={{ fontWeight: 600 }}>{v.name}</Link> · {v.type}{v.city ? ` · ${v.city}` : ""}{v.hcDeals > 0 ? ` · ${v.hcDeals} healthcare deals` : ""}</li>)}
          </ul>
        )}
      </>
    ));
  }

  if (subject?.profile?.length) {
    for (const p of subject.profile) {
      add(`profile-${p.heading.replace(/\W+/g, "-").toLowerCase()}`, p.heading, (
        <>
          <p className="fs-12 muted mb-8"><Tag tone="internal">RUWĀD data</Tag></p>
          <div className="panel panel-pad">
            <dl style={{ margin: 0, display: "grid", gap: 10 }}>
              {p.items.map((it) => (
                <div key={it.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px,220px) 1fr", gap: 12 }}>
                  <dt className="fs-12 muted">{it.label}</dt>
                  <dd className="fs-13" style={{ margin: 0, overflowWrap: "anywhere" }}>{it.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      ));
    }
  }

  if (developments.length) {
    add("developments", subject ? "Public developments" : "Recent funding and market developments", (
      <>
        <p className="fs-12 muted mb-12">Recent items found by web search. Read the original article before relying on it.</p>
        <SourceList items={developments} empty="" />
      </>
    ));
  }

  if (st.companies.length) {
    add("companies", subject ? "Peer companies on RUWĀD" : "Key companies", (
      <>
        <p className="fs-12 muted mb-12"><Tag tone="internal">RUWĀD data</Tag> &nbsp;Companies listed on RUWĀD{subject ? " in the same sector" : ", ranked by recorded funding"}.</p>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, margin: 0 }}>
          {st.companies.map((c) => <li key={c.slug} className="panel panel-pad fs-13"><Link href={`/startups/${c.slug}`} style={{ fontWeight: 600 }}>{c.name}</Link> · {c.category} · {c.stage}{c.city ? ` · ${c.city}` : ""}{c.fundingTotal > 0 ? ` · ${money(c.fundingTotal)} raised` : ""}</li>)}
        </ul>
      </>
    ));
  }

  if (subject?.missing?.length) {
    add("missing", "Missing information", (
      <div className="panel panel-pad">
        <p className="fs-12 muted mb-8">What RUWĀD does not have on record for this company. This report gives no investment recommendation or score.</p>
        <ul style={{ paddingLeft: 18, display: "grid", gap: 6, margin: 0 }}>{subject.missing.map((m, i) => <li key={i} className="fs-13">{m}</li>)}</ul>
      </div>
    ));
  }

  add("sources", "Sources", (
    <>
      <p className="fs-12 muted mb-12">{src.length} external source{src.length === 1 ? "" : "s"}, ranked by reliability (Saudi government first, then official sites, international bodies, consultancies, news). Links open the original page.</p>
      {src.length ? (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 560 }}>
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
    </>
  ));

  add("methodology", "Methodology", (
    <>
      <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>{g.methodology.map((m, i) => <li key={i} className="fs-13">{m}</li>)}</ul>
      <p className="fs-12 muted mt-8">{g.research.searchesUsed} web search{g.research.searchesUsed === 1 ? "" : "es"} run, {g.research.cacheHits} answered from saved results, {g.research.sourcesKept} sources kept.</p>
    </>
  ));

  add("coverage", "Data coverage notice", <div className="panel panel-pad"><p className="fs-13">{g.coverageNotice}</p></div>);

  return (
    <div className="content-in wide report-inner" style={{ maxWidth: 980 }}>
      <nav className="fs-12 muted mb-16"><Link href="/reports">Reports</Link> / {r.title}</nav>

      <header className="mb-24">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {!published ? <span className="badge badge-warn">Draft — not visible to the public</span> : <span className="badge badge-good">Published</span>}
          <span className="badge">{r.reportType}</span>
          <span className="badge">{r.geography}</span>
          <span className="badge">{r.sector}</span>
        </div>
        <h1 className="fs-28" style={{ fontWeight: 800 }}>{r.title}</h1>
        <p className="muted fs-13 mt-8">
          Generated {fmtDate(r.publicationDate)} · RUWĀD data as of {fmtDate(st.coverage.asOf)}
          {g.researchedAt ? ` · external research retrieved ${fmtDate(g.researchedAt)}` : " · no external research"}
        </p>
        <ReportAdminBar report={r} onChanged={(next) => setPublished(next.isPublished !== false)} />
      </header>

      {notice && (
        <div className="panel panel-pad mb-24" role="status" style={{ borderColor: "var(--warn)" }}>
          <strong className="fs-13">{notice === "disabled" ? "External research is switched off" : notice === "unavailable" ? "External research was unavailable" : "External research was only partly available"}</strong>
          <p className="fs-13 muted mt-8">{g.research.note ?? "Sections that need web sources may be thin. RUWĀD figures below are unaffected."}</p>
        </div>
      )}

      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="mb-32" aria-labelledby={`${s.id}-h`}>
          <h2 id={`${s.id}-h`} className="fs-19 mb-16" style={{ fontWeight: 700 }}>{i + 1}. {s.title}</h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}
