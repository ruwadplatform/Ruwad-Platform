"use client";

import { useState } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/intelligence/KpiCard";
import { BarChart } from "@/components/intelligence/BarChart";
import { ReportCover, coverBackground, coverFor } from "@/components/intelligence/ReportCover";
import type { LibraryContentView, Report } from "@/types/intelligence";
import { ReportAdminBar } from "./ReportAdminPanel";

/** A default RUWĀD library report: original RUWĀD analysis built from the RUWĀD database plus cited external facts.
 * Every external statement carries a numbered citation that links to a source entry (organization, year, geography, URL, wording). */

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

interface Cite { n: number; key: string; org: string; title: string; year: number; geography: string; url: string; detail: string; quote?: string; badge: string }

function buildCites(lib: LibraryContentView): Map<string, Cite> {
  const order: string[] = [];
  for (const s of lib.sections) for (const p of s.paragraphs) for (const id of p.factIds) if (!order.includes(id)) order.push(id);
  for (const f of lib.facts) if (!order.includes(f.id)) order.push(f.id);
  for (const w of lib.worldBank) if (!order.includes(w.id)) order.push(w.id);
  const facts = new Map(lib.facts.map((f) => [f.id, f]));
  const wb = new Map(lib.worldBank.map((w) => [w.id, w]));
  const out = new Map<string, Cite>();
  for (const id of order) {
    const f = facts.get(id);
    const w = wb.get(id);
    if (f) {
      out.set(id, {
        n: out.size + 1, key: id, org: f.organization, title: f.documentTitle, year: f.year, geography: f.geography, url: f.url, quote: f.quote,
        detail: f.verification === "live" ? `Wording re-checked on the source page on ${fmtDate(f.checkedAt)}` : `Wording read on the source page on ${fmtDate(f.verifiedOn)}`,
        badge: f.sourceType,
      });
    } else if (w) {
      out.set(id, { n: out.size + 1, key: id, org: "World Bank", title: `${w.label} (${w.unit})`, year: w.year, geography: w.geography, url: w.url, detail: `Value ${w.display}, retrieved live from the World Bank API`, badge: "International organization" });
    }
  }
  return out;
}

function Citations({ ids, cites }: { ids: string[]; cites: Map<string, Cite> }) {
  const items = [...new Set(ids)].map((id) => cites.get(id)).filter((c): c is Cite => !!c);
  if (!items.length) return null;
  return (
    <span className="fs-11" style={{ marginLeft: 6, whiteSpace: "nowrap" }}>
      {items.map((c) => <a key={c.key} href={`#src-${c.n}`} aria-label={`Source ${c.n}: ${c.org}`} style={{ marginRight: 4, fontWeight: 700 }}>[{c.n}]</a>)}
    </span>
  );
}

export function LibraryReportView({ report: r }: { report: Report }) {
  const lib = r.library!;
  const [published, setPublished] = useState(r.isPublished !== false);
  const cites = buildCites(lib);
  const dists = new Map(lib.distributions.map((d) => [d.key, d]));
  const sourceList = [...cites.values()].sort((a, b) => a.n - b.n);
  const cover = coverFor(r.id);
  const liveCount = lib.facts.filter((f) => f.verification === "live").length;

  return (
    <div className="content-in wide" style={{ maxWidth: 980 }}>
      <nav className="fs-12 muted mb-16"><Link href="/reports">Reports</Link> / {r.title}</nav>

      <header className="mb-24">
        {cover && (
          <div style={{ position: "relative", height: "clamp(120px, 24vw, 240px)", borderRadius: "var(--radius-card)", overflow: "hidden", marginBottom: 20, background: coverBackground(cover) }}>
            <ReportCover kind={cover} fit="meet" />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {!published && <span className="badge badge-warn">Unpublished — not visible to the public</span>}
          <span className="badge badge-good">RUWĀD Report</span>
          <span className="badge">{r.category}</span>
          <span className="badge">{r.geography}</span>
        </div>
        <h1 className="fs-28" style={{ fontWeight: 800 }}>{r.title}</h1>
        <p className="fs-14 mt-8" style={{ maxWidth: 720 }}>{r.description}</p>
        <p className="muted fs-13 mt-8">
          Published {fmtDate(r.publicationDate)} · RUWĀD data as of {fmtDate(lib.asOf ?? lib.generatedAt)} · {sourceList.length} cited source{sourceList.length === 1 ? "" : "s"} · {r.readingTime}
        </p>
        <ReportAdminBar report={r} onChanged={(next) => setPublished(next.isPublished !== false)} />
      </header>

      <nav aria-label="Report sections" className="panel panel-pad mb-24">
        <div className="fs-12 muted mb-8">In this report</div>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))" }}>
          {lib.sections.map((s, i) => <li key={s.heading} className="fs-13"><a href={`#sec-${i}`}>{s.heading}</a></li>)}
          <li className="fs-13"><a href="#market-size">Market size</a></li>
          <li className="fs-13"><a href="#not-covered">What this report does not cover</a></li>
          <li className="fs-13"><a href="#sources">Sources</a></li>
        </ol>
      </nav>

      {lib.sections.map((s, i) => (
        <section key={s.heading} id={`sec-${i}`} className="mb-32" aria-labelledby={`sec-${i}-h`}>
          <h2 id={`sec-${i}-h`} className="fs-19 mb-12" style={{ fontWeight: 700 }}>{s.heading}</h2>
          {s.metrics && s.metrics.length > 0 && <div className="kpi-row mb-16">{s.metrics.map((m) => <KpiCard key={m.label} label={m.label} value={m.value} delta={m.note} />)}</div>}
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            {s.paragraphs.map((p, j) => (
              <p key={j} className="fs-14" style={{ lineHeight: "var(--line-height-relaxed)", margin: 0 }}>{p.text}<Citations ids={p.factIds} cites={cites} /></p>
            ))}
          </div>
          {(s.distributionKeys ?? []).map((k) => dists.get(k)).filter((d): d is NonNullable<typeof d> => !!d).length > 0 && (
            <div className="mt-16">
              <p className="fs-12 muted mb-8"><span className="badge badge-good">RUWĀD data</span> &nbsp;Counted from the RUWĀD platform database.</p>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))" }}>
                {(s.distributionKeys ?? []).map((k) => dists.get(k)).filter((d): d is NonNullable<typeof d> => !!d).map((d) => (
                  <div key={d.key} className="panel panel-pad" style={{ minWidth: 0 }}>
                    <h4 className="fs-13 mb-12">{d.title}</h4>
                    <BarChart data={d.rows} unit={d.unit === "SAR M" ? "M" : undefined} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      <section id="market-size" className="mb-32" aria-labelledby="market-size-h">
        <h2 id="market-size-h" className="fs-19 mb-12" style={{ fontWeight: 700 }}>Market size</h2>
        <div className="panel panel-pad"><p className="fs-14" style={{ margin: 0 }}>{lib.marketSize.message}</p></div>
      </section>

      <section id="not-covered" className="mb-32" aria-labelledby="not-covered-h">
        <h2 id="not-covered-h" className="fs-19 mb-12" style={{ fontWeight: 700 }}>What this report does not cover</h2>
        <div className="panel panel-pad">
          <ul style={{ paddingLeft: 18, display: "grid", gap: 6, margin: 0 }}>{lib.missing.map((m, i) => <li key={i} className="fs-13">{m}</li>)}</ul>
        </div>
      </section>

      <section id="sources" className="mb-32" aria-labelledby="sources-h">
        <h2 id="sources-h" className="fs-19 mb-12" style={{ fontWeight: 700 }}>Sources</h2>
        <p className="fs-12 muted mb-12">
          {sourceList.length} source{sourceList.length === 1 ? "" : "s"}, each with its organization, year and geography. The quoted wording is copied from the source; {liveCount} of {lib.facts.length} quotes were re-checked against the live page when this report was generated. Links open the original page.
        </p>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
          {sourceList.map((c) => (
            <li key={c.key} id={`src-${c.n}`} className="panel panel-pad" style={{ scrollMarginTop: 80 }}>
              <div className="fs-11 muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="badge badge-warn">[{c.n}]</span><span>{c.badge}</span><span>· {c.org}</span><span>· {c.year}</span><span>· {c.geography}</span>
              </div>
              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, display: "block", marginTop: 6, overflowWrap: "anywhere" }}>{c.title}</a>
              {c.quote ? <p className="fs-13 mt-8" style={{ fontStyle: "italic", overflowWrap: "anywhere" }}>“{c.quote}”</p> : null}
              <p className="fs-12 muted mt-8">{c.detail}</p>
              <p className="fs-11 muted mt-4" style={{ overflowWrap: "anywhere" }}>{c.url}</p>
            </li>
          ))}
        </ol>
        {lib.furtherReading.length > 0 && (
          <div className="mt-24">
            <h3 className="fs-15 mb-8" style={{ fontWeight: 700 }}>Further reading</h3>
            <p className="fs-12 muted mb-12">Found with RUWĀD&apos;s web search for context. No figure in this report is taken from these pages.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {lib.furtherReading.map((s) => (
                <li key={s.id} className="panel panel-pad">
                  <div className="fs-11 muted">{s.sourceTypeLabel} · {s.domain}{s.publishedAt ? ` · ${fmtDate(s.publishedAt)}` : ""}</div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{s.title}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section id="methodology" className="mb-32" aria-labelledby="methodology-h">
        <h2 id="methodology-h" className="fs-19 mb-12" style={{ fontWeight: 700 }}>Methodology</h2>
        <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>{lib.methodology.map((m, i) => <li key={i} className="fs-13">{m}</li>)}</ul>
      </section>
    </div>
  );
}
