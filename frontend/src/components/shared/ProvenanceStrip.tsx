import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { fmtProvenanceDate } from "@/lib/widgets";
import type { Provenance } from "@/lib/scoring";

/** Ported verbatim from provenanceStripHtml() (js/widgets.js:70-81). */
export function ProvenanceStrip({ provenance, compact }: { provenance: Provenance | undefined; /** Single quiet row: confidence badge, source count, last update; any part without data is left out. */ compact?: boolean }) {
  if (!provenance) return null;
  const tierClass = provenance.confidence === "High" ? "badge-good" : provenance.confidence === "Medium" ? "badge-warn" : "badge-neutral";
  if (compact) {
    const parts = [
      provenance.confidence && <span key="c" className={`badge ${tierClass}`}>{provenance.confidence} Confidence</span>,
      provenance.sources?.length > 0 && <span key="s">{provenance.sources.length} source{provenance.sources.length === 1 ? "" : "s"}: {provenance.sources.join(", ")}</span>,
      provenance.lastUpdated && <span key="u">Updated {fmtProvenanceDate(provenance.lastUpdated)}</span>,
    ].filter(Boolean);
    if (parts.length === 0) return null;
    return (
      <div className="provenance-strip provenance-strip--compact">
        {parts.map((part, i) => (
          <span className="provenance-part" key={i}>
            {i > 0 && <span className="provenance-sep" aria-hidden="true">·</span>}
            {part}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="provenance-strip">
      <span><RuwadIcon name="clock" size={12} /> Last updated {fmtProvenanceDate(provenance.lastUpdated)}</span>
      <span className="provenance-sep">·</span>
      <span>{provenance.sources.length} source{provenance.sources.length === 1 ? "" : "s"}: {provenance.sources.join(", ")}</span>
      <span className="provenance-sep">·</span>
      <span className={`badge ${tierClass}`}>{provenance.confidence} Confidence</span>
    </div>
  );
}
