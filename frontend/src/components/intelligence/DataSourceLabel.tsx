import { RuwadIcon } from "@/components/icons/ruwad-icon";

/** Small provenance tag for dashboard/report charts — distinct from the
 * entity-profile `ProvenanceStrip` (which carries confidence/last-updated
 * for a single entity record), this just labels a chart's data source. */
export function DataSourceLabel({ text = "Source: RUWĀD platform data (sample)" }: { text?: string }) {
  return <div className="small muted mt-8" style={{ display: "flex", alignItems: "center", gap: 5 }}><RuwadIcon name="doc" size={11} /> {text}</div>;
}
