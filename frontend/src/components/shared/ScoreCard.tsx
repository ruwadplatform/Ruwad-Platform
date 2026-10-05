"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { LockedTeaser } from "./LockedTeaser";
import { valenceColor } from "@/lib/scoring";
import type { ScoreFactorKey, ScoreFactors, ScoreStatus } from "@/types/entities";

const SUBS: { label: string; key: ScoreFactorKey; why: string }[] = [
  { label: "Growth Momentum", key: "growth", why: "Revenue, user and partnership growth trend over the last reported periods." },
  { label: "Financial Strength", key: "financial", why: "Runway, burn efficiency and diversity of the cap table's funding sources." },
  { label: "Market Potential", key: "market", why: "Size and reachability of the venture's TAM/SAM/SOM and category tailwinds." },
  { label: "Team Strength", key: "team", why: "Founder domain expertise, team completeness and prior track record." },
  { label: "Regulatory Readiness", key: "regulatory", why: "Progress through SFDA/FDA/CE pathways relative to the company's stage." },
  { label: "Technology Differentiation", key: "technology", why: "Defensibility of the underlying technology — patents, data moat, technical risk." },
];

const METHODOLOGY_TOOLTIP = "The RUWĀD Score is a data-driven assessment of a company's growth, financial strength, market potential, team, regulatory readiness and technology differentiation. Data Confidence reflects the completeness and reliability of the information available for the assessment.";

interface ScoreCardProps {
  score: number | null;
  status: ScoreStatus;
  confidence: number | null;
  factors: ScoreFactors;
  category: string;
  peers: { category: string; ruwadScore: number | null }[];
  loggedIn: boolean;
  /** True only for the listing's own owner (checked via the Data Room
   * status endpoint's isOwner flag) — the "complete your information" nudge
   * is only ever shown to the person who can act on it, never to a visitor
   * or another founder's investor. */
  isOwner?: boolean;
}

/** Ring/subscore-bar markup ported from the original js/profiles.js design,
 * now driven by a real calculated score (0-10) instead of a flat hardcoded
 * placeholder, with five distinct states instead of always assuming a
 * number exists (see ScoreStatus). A missing score is never shown as 0 —
 * that would misread as "assessed and found poor" rather than "not yet
 * assessed". */
export function ScoreCard({ score, status, confidence, factors, category, peers, loggedIn, isOwner }: ScoreCardProps) {
  if (!loggedIn) return <ScoreCardTeaser score={score} status={status} category={category} peers={peers} />;

  if (status !== "CALCULATED" || score == null) return <PendingScoreCard status={status} score={score} isOwner={isOwner} />;

  const pct = (score / 10) * 339.3;
  return (
    <div className="panel panel-pad">
      <div className="eyebrow brand mb-8" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        RUWĀD Score <span title={METHODOLOGY_TOOLTIP}><RuwadIcon name="help" size={12} /></span>
      </div>
      <div className="score-card mb-16">
        <div className="score-ring">
          <svg width={104} height={104}>
            <circle cx={52} cy={52} r={45} fill="none" stroke="var(--border)" strokeWidth={9} />
            <circle cx={52} cy={52} r={45} fill="none" stroke={valenceColor(score, 10)} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${pct} 400`} />
          </svg>
          <div className="score-ring-val"><b>{score.toFixed(1)}</b><span>/ 10</span></div>
        </div>
        <div className="sc-sub small muted">Composite score computed from the six factors below.</div>
        {confidence != null && (
          <div className="small muted mt-4" title={METHODOLOGY_TOOLTIP}>Data Confidence: {Math.round(confidence * 100)}%</div>
        )}
      </div>
      {SUBS.map(({ label, key, why }) => {
        const f = factors[key];
        const hasScore = f?.score != null;
        return (
          <div className="subscore-row" title={hasScore ? why : "Not enough data reported for this factor yet."} key={key}>
            <div className="sl">{label}</div>
            <div className="subscore-track"><div className="subscore-fill" style={{ width: `${hasScore ? f.score! * 10 : 0}%`, background: hasScore ? valenceColor(f.score! * 10, 100) : "var(--border)" }} /></div>
            <div className="sv mono">{hasScore ? f.score!.toFixed(1) : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Non-CALCULATED states — plain language, never a raw error, never a bare
 * "0" that would misread as a bad assessment. */
function PendingScoreCard({ status, score, isOwner }: { status: ScoreStatus; score: number | null; isOwner?: boolean }) {
  const copy: Record<Exclude<ScoreStatus, "CALCULATED">, { title: string; body: string }> = {
    INSUFFICIENT_DATA: { title: "RUWĀD Score pending", body: "Not enough verified information is currently available to calculate a reliable score." },
    NOT_CALCULATED: { title: "RUWĀD Score not calculated yet", body: "This listing hasn't been scored yet." },
    STALE: { title: "RUWĀD Score may be out of date", body: "The company's information has changed since this score was last calculated." },
    ERROR: { title: "RUWĀD Score unavailable", body: "The score couldn't be calculated right now. Please check back later." },
  };
  const { title, body } = copy[status as Exclude<ScoreStatus, "CALCULATED">] ?? copy.NOT_CALCULATED;
  return (
    <div className="panel panel-pad">
      <div className="eyebrow brand mb-8">RUWĀD Score</div>
      <div className="small" style={{ fontWeight: 600 }}>{title}</div>
      <p className="muted small mt-4">{body}</p>
      {status === "STALE" && score != null && <div className="small muted mt-8">Last calculated score: {score.toFixed(1)} / 10</div>}
      {isOwner && (
        <a href="/workspace/startup" className="small mt-8" style={{ display: "block", textDecoration: "underline" }}>
          See exactly what is needed to complete your assessment
        </a>
      )}
    </div>
  );
}

function ScoreCardTeaser({ score, status, category, peers }: { score: number | null; status: ScoreStatus; category: string; peers: { category: string; ruwadScore: number | null }[] }) {
  if (status !== "CALCULATED" || score == null) {
    return (
      <div className="panel panel-pad">
        <div className="eyebrow brand mb-8">RUWĀD Score</div>
        <p className="muted small">Not enough verified information is currently available to calculate a reliable score.</p>
      </div>
    );
  }
  const pool = peers.filter((x) => x.category === category && x.ruwadScore != null);
  const rank = pool.filter((x) => (x.ruwadScore as number) > score).length;
  const pctile = pool.length ? Math.max(1, Math.round((1 - rank / pool.length) * 100)) : null;
  return (
    <div className="panel panel-pad">
      <div className="eyebrow brand mb-8">RUWĀD Score</div>
      <div className="score-teaser">
        <div className="st-big">{score.toFixed(1)}</div>
        {pctile != null && <div className="st-sub">Top {100 - pctile + 1}% of {category} companies</div>}
        <LockedTeaser title="Unlock RUWĀD Score Analysis" body="See the full six-factor breakdown, peer benchmarks and growth indicators behind this score." blurLines={4} cta="View Complete Analysis" />
      </div>
    </div>
  );
}
