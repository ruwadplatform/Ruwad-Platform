import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { fmtProvenanceDate } from "@/lib/widgets";
import type { Provenance } from "@/lib/scoring";

/** Ported verbatim from provenanceStripHtml() (js/widgets.js:70-81). */
export function ProvenanceStrip({ provenance }: { provenance: Provenance | undefined }) {
  if (!provenance) return null;
  const tierClass = provenance.confidence === "High" ? "badge-good" : provenance.confidence === "Medium" ? "badge-warn" : "badge-neutral";
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
