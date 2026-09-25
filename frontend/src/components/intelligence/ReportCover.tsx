import { useId, type ReactNode } from "react";

/** Original cover artwork for the six default RUWĀD reports: monochrome line art on the brand's navy, one motif per report.
 * It is decorative (no data, axes or figures), drawn as inline SVG so it needs no image files and follows the app's colors. */

export type CoverKind = "ecosystem" | "digital" | "biotech" | "medtech" | "funding" | "infrastructure";

const COVER_BY_SLUG: Record<string, CoverKind> = {
  "saudi-healthcare-ecosystem-overview-2026": "ecosystem",
  "saudi-digital-health-landscape-2026": "digital",
  "saudi-biotechnology-landscape-2026": "biotech",
  "saudi-medtech-landscape-2026": "medtech",
  "saudi-healthcare-startup-funding-landscape-2026": "funding",
  "saudi-healthcare-infrastructure-workforce-2026": "infrastructure",
};

/** The cover for a report, or null when it has none (community and other reports keep their existing plain thumbnail). */
export const coverFor = (slug: string): CoverKind | null => COVER_BY_SLUG[slug] ?? null;

const W = 400;
const H = 160;
const INK = "#E7F0FB";
const line = (o = 0.5, w = 1.4) => ({ stroke: INK, strokeOpacity: o, strokeWidth: w, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const });
const dot = (o = 0.7) => ({ fill: INK, fillOpacity: o });

function Ecosystem() {
  const hub = { x: 210, y: 82 };
  const sats = [[70, 40], [120, 118], [165, 30], [285, 28], [335, 74], [300, 128], [230, 140], [40, 96]];
  return (
    <g>
      {[30, 52, 78].map((r, i) => <circle key={r} cx={hub.x} cy={hub.y} r={r} {...line(0.12 + i * 0.03, 1)} strokeDasharray={i === 1 ? "3 5" : undefined} />)}
      {sats.map(([x, y], i) => <line key={i} x1={hub.x} y1={hub.y} x2={x} y2={y} {...line(0.28, 1)} />)}
      <path d="M70 40 L120 118 M285 28 L335 74 L300 128 M165 30 L285 28" {...line(0.14, 1)} />
      {sats.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 6 : 4} {...dot(0.6)} />)}
      <circle cx={hub.x} cy={hub.y} r={12} {...line(0.9, 1.6)} />
      <circle cx={hub.x} cy={hub.y} r={5} {...dot(0.95)} />
    </g>
  );
}

function Digital() {
  const ecg = "M0 96 H92 L108 96 L120 60 L134 128 L148 82 L158 96 H236 L248 96 L258 72 L268 108 L278 96 H330";
  return (
    <g>
      {Array.from({ length: 9 }, (_, r) => Array.from({ length: 16 }, (_, c) => <circle key={`${r}-${c}`} cx={20 + c * 24} cy={16 + r * 16} r={1} {...dot(0.16)} />))}
      <path d={ecg} transform="translate(20 -4)" {...line(0.85, 2)} />
      <path d={ecg} transform="translate(20 6)" {...line(0.18, 1.2)} />
      <rect x={318} y={26} width={62} height={108} rx={10} {...line(0.55, 1.6)} />
      <line x1={340} y1={36} x2={358} y2={36} {...line(0.5, 1.6)} />
      <path d="M330 92 h10 l5 -14 l7 26 l5 -12 h10" {...line(0.9, 1.6)} />
      <circle cx={349} cy={122} r={3} {...dot(0.5)} />
    </g>
  );
}

function Biotech() {
  const pts = (phase: number) => Array.from({ length: 61 }, (_, i) => `${i === 0 ? "M" : "L"}${(20 + i * 6.2).toFixed(1)} ${(80 + Math.sin(i / 4.6 + phase) * 44).toFixed(1)}`).join(" ");
  return (
    <g>
      {Array.from({ length: 31 }, (_, i) => {
        const x = 20 + i * 12.4; const t = (i * 2) / 4.6;
        const y1 = 80 + Math.sin(t) * 44; const y2 = 80 + Math.sin(t + Math.PI) * 44;
        return <line key={i} x1={x} y1={y1} x2={x} y2={y2} {...line(0.1 + Math.abs(Math.cos(t)) * 0.3, 1.2)} />;
      })}
      <path d={pts(0)} {...line(0.85, 2)} />
      <path d={pts(Math.PI)} {...line(0.5, 2)} />
      {[[70, 24], [180, 132], [300, 30]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={5} {...line(0.5, 1.2)} />)}
    </g>
  );
}

function Medtech() {
  return (
    <g>
      <path d="M0 40 H90 L110 60 H150 M0 80 H70 L96 106 H150 M0 120 H120 L136 104 M250 60 H310 L326 44 H400 M250 80 H400 M250 104 H320 L340 124 H400" {...line(0.3, 1.2)} />
      {[[150, 60], [150, 106], [250, 60], [250, 104], [90, 40], [326, 44], [340, 124]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={3} {...dot(0.6)} />)}
      <rect x={162} y={34} width={76} height={92} rx={12} {...line(0.9, 1.8)} />
      <rect x={172} y={44} width={56} height={72} rx={8} {...line(0.25, 1)} />
      <path d="M200 62 v36 M182 80 h36" {...line(0.95, 3)} />
      {[46, 62, 98, 114].map((y) => <g key={y}><line x1={154} y1={y} x2={162} y2={y} {...line(0.5, 1.4)} /><line x1={238} y1={y} x2={246} y2={y} {...line(0.5, 1.4)} /></g>)}
    </g>
  );
}

function Funding() {
  const bars = [[40, 34], [92, 50], [144, 66], [196, 82], [248, 98], [300, 114]];
  return (
    <g>
      {[46, 82, 118].map((y) => <line key={y} x1={24} y1={y} x2={376} y2={y} {...line(0.08, 1)} strokeDasharray="2 6" />)}
      {bars.map(([x, h], i) => <rect key={x} x={x} y={140 - h} width={34} height={h} rx={4} fill={INK} fillOpacity={0.08 + i * 0.05} stroke={INK} strokeOpacity={0.4} strokeWidth={1} />)}
      <path d="M30 118 C110 110 150 80 205 58 S310 30 372 20" {...line(0.9, 2)} />
      <path d="M372 20 l-12 1 m12 -1 l-3 12" {...line(0.9, 2)} />
      {[[205, 58], [30, 118]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={5} {...dot(0.9)} />)}
      <circle cx={318} cy={44} r={16} {...line(0.5, 1.4)} /><circle cx={318} cy={44} r={9} {...line(0.3, 1)} />
    </g>
  );
}

function Infrastructure() {
  return (
    <g>
      <line x1={0} y1={128} x2={W} y2={128} {...line(0.4, 1.4)} />
      <rect x={150} y={44} width={100} height={84} rx={3} {...line(0.9, 1.8)} />
      <rect x={176} y={22} width={48} height={22} rx={3} {...line(0.6, 1.4)} />
      <path d="M200 26 v14 M193 33 h14" {...line(0.95, 2.4)} />
      {[[164, 60], [188, 60], [212, 60], [236, 60], [164, 84], [188, 84], [212, 84], [236, 84]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 6} y={y - 6} width={12} height={12} rx={2} {...line(0.35, 1)} />)}
      <rect x={188} y={104} width={24} height={24} rx={2} {...line(0.6, 1.4)} />
      <rect x={60} y={72} width={64} height={56} rx={3} {...line(0.5, 1.4)} />
      <rect x={276} y={64} width={72} height={64} rx={3} {...line(0.5, 1.4)} />
      <rect x={20} y={96} width={30} height={32} rx={2} {...line(0.3, 1.2)} />
      <rect x={358} y={92} width={26} height={36} rx={2} {...line(0.3, 1.2)} />
      {Array.from({ length: 11 }, (_, i) => {
        const x = 42 + i * 32;
        return <g key={i} opacity={0.75}><circle cx={x} cy={144} r={3.2} {...dot(0.9)} /><path d={`M${x - 4} 154 q4 -8 8 0`} {...line(0.7, 1.6)} /></g>;
      })}
    </g>
  );
}

const MOTIFS: Record<CoverKind, () => ReactNode> = { ecosystem: Ecosystem, digital: Digital, biotech: Biotech, medtech: Medtech, funding: Funding, infrastructure: Infrastructure };
/** Slightly different navy tones per cover so the six read as a set without looking identical. */
const TONES: Record<CoverKind, [string, string]> = {
  ecosystem: ["#101430", "#050612"], digital: ["#1A2044", "#080A1F"], biotech: ["#0C1030", "#050612"],
  medtech: ["#161B3D", "#080A1F"], funding: ["#101430", "#08091C"], infrastructure: ["#1A2044", "#050612"],
};

/** CSS background matching a cover's tones, for containers that show the artwork at its own proportions (`fit="meet"`). */
export const coverBackground = (kind: CoverKind) => `linear-gradient(135deg, ${TONES[kind][0]}, ${TONES[kind][1]})`;

/** Fills its parent (which must be `position: relative` with a set height). Purely decorative.
 * fit="slice" (cards) crops the artwork to fill; fit="meet" (wide banners) keeps it whole and centred on the parent's own background. */
export function ReportCover({ kind, className, fit = "slice" }: { kind: CoverKind; className?: string; fit?: "slice" | "meet" }) {
  const Motif = MOTIFS[kind];
  const [a, b] = TONES[kind];
  const gid = `cover-${kind}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={`xMidYMid ${fit}`} aria-hidden="true" focusable="false"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        <radialGradient id={`${gid}-glow`} cx="0.5" cy="0.5" r="0.7"><stop offset="0" stopColor={INK} stopOpacity="0.1" /><stop offset="1" stopColor={INK} stopOpacity="0" /></radialGradient>
      </defs>
      {fit === "slice" && <rect width={W} height={H} fill={`url(#${gid})`} />}
      {fit === "slice" && <rect width={W} height={H} fill={`url(#${gid}-glow)`} />}
      <Motif />
    </svg>
  );
}
