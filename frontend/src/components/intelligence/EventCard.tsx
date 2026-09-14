"use client";

import { useToast } from "@/components/shell/ToastProvider";
import type { EventItem } from "@/types/intelligence";

const STATUS_CLASS: Record<EventItem["registrationStatus"], string> = {
  Open: "badge-good", Closed: "badge-neutral", "Coming Soon": "badge-info",
};

/** Ported from eventCard() (js/widgets.js:139-147) — reuses `.entity-card`
 * with `.edesc`/`.emeta`/`.eyebrow` (same base classes as `.events-grid`),
 * extended with country/organizer/type and a registration-status badge. */
export function EventCard({ event: e }: { event: EventItem }) {
  const toast = useToast();
  return (
    <div className="entity-card" style={{ cursor: "default" }}>
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="eyebrow brand">{e.type}</div>
        <span className={`badge ${STATUS_CLASS[e.registrationStatus]}`}>{e.registrationStatus}</span>
      </div>
      <b className="fs-13">{e.name}</b>
      <div className="edesc">{e.description}</div>
      <div className="emeta">
        <span className="tag">{e.date}</span>
        <span className="tag">{e.location}, {e.country}</span>
        <span className="tag">{e.sector}</span>
      </div>
      <div className="small muted mt-8">Organized by {e.organizer}</div>
      <button className="btn btn-outline btn-sm mt-8" onClick={() => toast("Added to calendar — demo only")}>Add to Calendar</button>
    </div>
  );
}
