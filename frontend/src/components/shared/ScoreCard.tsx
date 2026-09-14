"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { LockedTeaser } from "./LockedTeaser";
import { valenceColor } from "@/lib/scoring";
import type { SubScores } from "@/types/entities";

const SUBS: { label: string; key: keyof SubScores; why: string }[] = [
  { label: "Growth Momentum", key: "growth", why: "Revenue, user and partnership growth trend over the last 4 reported quarters." },
  { label: "Financial Strength", key: "financial", why: "Runway, burn efficiency and diversity of the cap table's funding sources." },
  { label: "Market Potential", key: "market", why: "Size and reachability of the venture's TAM/SAM/SOM and category tailwinds." },
  { label: "Team Strength", key: "team", why: "Founder domain expertise, team completeness and prior track record." },
  { label: "Regulatory Readiness", key: "regulatory", why: "Progress through SFDA/FDA/CE pathways relative to the company's stage." },
  { label: "Technology Differentiation", key: "tech", why: "Defensibility of the underlying technology — patents, data moat, technical risk." },
];

/** Ported verbatim from scoreCard()/scoreCardTeaser() (js/profiles.js:253-300)
 * — same score-ring dasharray formula (score/1000*339.3, "400" gap so the
 * pattern never wraps) and subscore-bar markup, not a chart library. */
export function ScoreCard({ score, sub, category, peers, loggedIn }: {
  score: number; sub: SubScores; category: string; peers: { category: string; score: number }[]; loggedIn: boolean;
}) {
  if (!loggedIn) return <ScoreCardTeaser score={score} category={category} peers={peers} />;

  const pct = (score / 1000) * 339.3;
  return (
    <div className="panel panel-pad">
      <div className="eyebrow brand mb-8" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        RUWĀD Score <span title="A composite 0–1000 score weighting the six factors below, each scored independently and combined with equal weighting."><RuwadIcon name="help" size={12} /></span>
      </div>
      <div className="score-card mb-16">
        <div className="score-ring">
          <svg width={104} height={104}>
            <circle cx={52} cy={52} r={45} fill="none" stroke="var(--border)" strokeWidth={9} />
            <circle cx={52} cy={52} r={45} fill="none" stroke={valenceColor(score, 1000)} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${pct} 400`} />
          </svg>
          <div className="score-ring-val"><b>{score}</b><span>/ 1000</span></div>
        </div>
        <div className="sc-sub small muted">Demo/mock scoring only — illustrates how RUWĀD would rank ecosystem readiness.</div>
      </div>
      {SUBS.map(({ label, key, why }) => (
        <div className="subscore-row" title={why} key={key}>
          <div className="sl">{label}</div>
          <div className="subscore-track"><div className="subscore-fill" style={{ width: `${sub[key]}%`, background: valenceColor(sub[key], 100) }} /></div>
          <div className="sv mono">{sub[key]}</div>
        </div>
      ))}
    </div>
  );
}

function ScoreCardTeaser({ score, category, peers }: { score: number; category: string; peers: { category: string; score: number }[] }) {
  const pool = peers.filter((x) => x.category === category);
  const rank = pool.filter((x) => x.score > score).length;
  const pctile = Math.max(1, Math.round((1 - rank / pool.length) * 100));
  return (
    <div className="panel panel-pad">
      <div className="eyebrow brand mb-8">RUWĀD Score</div>
      <div className="score-teaser">
        <div className="st-big">{score}</div>
        <div className="st-sub">Top {100 - pctile + 1}% of {category} companies</div>
        <LockedTeaser title="Unlock RUWĀD Score Analysis" body="See the full six-factor breakdown, peer benchmarks and growth indicators behind this score." blurLines={4} cta="View Complete Analysis" />
      </div>
    </div>
  );
}
