import type { ReportBadge } from "@/types/intelligence";

const BADGE_CLASS: Record<ReportBadge, string> = {
  Featured: "badge-gold", New: "badge-info", Premium: "badge-gold", "Ruwād Research": "badge-neutral",
};

export function ReportBadges({ badges }: { badges: ReportBadge[] }) {
  if (!badges.length) return null;
  return (
    <div className="flex gap-6" style={{ flexWrap: "wrap" }}>
      {badges.map((b) => <span className={`badge ${BADGE_CLASS[b]}`} key={b}>{b}</span>)}
    </div>
  );
}
