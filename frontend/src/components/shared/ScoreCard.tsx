"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { LockedTeaser } from "./LockedTeaser";
import { ImproveScorePrompt } from "./ImproveScorePrompt";
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

const CONFIDENCE_TOOLTIP = "Data Confidence indicates how much of the information required to calculate the RUWĀD Score is currently available.";

const GAUGE_SIZE = 120;
const GAUGE_RADIUS = 52;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

const EXISTING_DATA_NOTE = "Based only on the information provided for this company. A factor with no data counts as 0, so the score rises as more information is added.";

interface ScoreCardProps {
  score: number | null;
  status: ScoreStatus;
  confidence: number | null;
  /** The score's methodology version; the existing-startup basis carries an "-EXISTING-DATA" suffix and is labelled as such. */
  version?: string | null;
  factors: ScoreFactors;
  category: string;
  peers: { category: string; ruwadScore: number | null }[];
  loggedIn: boolean;
  /** True only for the listing's own owner (checked via the Data Room
   * status endpoint's isOwner flag) — the "complete your information" nudge
   * is only ever shown to the person who can act on it, never to a visitor
   * or another founder's investor. */
  isOwner?: boolean;
  /** The startup's backend id; lets the owner's "improve your score" prompt load what is still missing. */
  entityId?: string;
}

/** Ring/subscore-bar markup ported from the original js/profiles.js design,
 * now driven by a real calculated score (0-10) instead of a flat hardcoded
 * placeholder, with five distinct states instead of always assuming a
 * number exists (see ScoreStatus). A missing score is never shown as 0 —
 * that would misread as "assessed and found poor" rather than "not yet
 * assessed". */
export function ScoreCard({ score, status, confidence, version, factors, category, peers, loggedIn, isOwner, entityId }: ScoreCardProps) {
  if (!loggedIn) return <ScoreCardTeaser score={score} status={status} category={category} peers={peers} />;

  if (status !== "CALCULATED" || score == null) return <PendingScoreCard status={status} score={score} isOwner={isOwner} entityId={entityId} />;

  const scorePct = clampPct(score * 10);
  const confidencePct = confidence != null ? clampPct(Math.round(confidence * 100)) : null;
  return (
    <div className="panel rscore">
      <div className="rscore-head">
        <span className="rscore-title">RUWĀD Score</span>
        <span className="rscore-info" title={METHODOLOGY_TOOLTIP} tabIndex={0} role="img" aria-label="About the RUWĀD Score"><RuwadIcon name="help" size={14} /></span>
      </div>

      <div className="rscore-gauge" role="img" aria-label={`RUWĀD Score ${score.toFixed(1)} out of 10`}>
        <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
          <circle className="rscore-gauge-track" cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS} fill="none" strokeWidth={9} />
          <circle className="rscore-gauge-fill" cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS} fill="none" strokeWidth={9} strokeLinecap="round" strokeDasharray={`${(scorePct / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`} />
        </svg>
        <div className="rscore-gauge-val"><b>{score.toFixed(1)}</b><span>/ 10</span></div>
      </div>

      {confidencePct != null && (
        <div className="rscore-confidence" title={CONFIDENCE_TOOLTIP}>
          <div className="rscore-row">
            <span className="rscore-label">Data Confidence <RuwadIcon name="help" size={12} /></span>
            <span className="rscore-value">{confidencePct}%</span>
          </div>
          <div className="rscore-bar" role="progressbar" aria-label="Data Confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidencePct}>
            <div className="rscore-bar-fill" style={{ width: `${confidencePct}%` }} />
          </div>
        </div>
      )}

      <p className="rscore-desc">Composite score computed from the six factors below.</p>
      {version?.endsWith("EXISTING-DATA") && <p className="rscore-desc rscore-note">{EXISTING_DATA_NOTE}</p>}

      <ul className="rscore-factors">
        {SUBS.map(({ label, key, why }) => {
          const f = factors[key];
          const hasScore = f?.score != null;
          const value = hasScore ? f.score! : null;
          return (
            <li className="rscore-factor" title={hasScore ? why : "Not enough data reported for this factor yet."} key={key}>
              <div className="rscore-row">
                <span className="rscore-label">{label}</span>
                <span className="rscore-value">{value != null ? value.toFixed(1) : "—"}</span>
              </div>
              <div className="rscore-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={value ?? undefined}>
                <div className="rscore-bar-fill" style={{ width: `${value != null ? clampPct(value * 10) : 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {isOwner && <ImproveScorePrompt entityId={entityId} />}
    </div>
  );
}

/** Non-CALCULATED states — plain language, never a raw error, never a bare
 * "0" that would misread as a bad assessment. */
function PendingScoreCard({ status, score, isOwner, entityId }: { status: ScoreStatus; score: number | null; isOwner?: boolean; entityId?: string }) {
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
      {isOwner && <ImproveScorePrompt entityId={entityId} />}
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
