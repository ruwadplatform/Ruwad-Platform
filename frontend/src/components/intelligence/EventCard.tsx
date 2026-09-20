"use client";

import { AddToCalendar } from "@/components/intelligence/AddToCalendar";
import { eventStatusOf, formatEventDatesShort, safeHttpUrl } from "@/lib/content-format";
import type { EventItem } from "@/types/intelligence";

/** One collected event, in the original RUWĀD card style: type label, title,
 * short description, date + place, then "Add to Calendar". "View Event →"
 * opens the event's own page in a new tab (only the link does — the card
 * itself isn't clickable, so it never competes with the calendar menu). */
export function EventCard({ event: e }: { event: EventItem }) {
  const status = eventStatusOf(e.startDate, e.endDate); // recomputed for the viewer's today
  const view = safeHttpUrl(e.url);
  const place = [e.city, e.country].filter(Boolean).join(", ") || e.location;

  return (
    <div className="entity-card" style={{ cursor: "default" }}>
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div className="eyebrow brand">{e.type}</div>
        {status === "ONGOING" && <span className="badge badge-good">ONGOING</span>}
      </div>
      <b className="fs-13">{e.name}</b>
      {e.description && <div className="edesc">{e.description}</div>}
      <div className="emeta">
        <span className="tag">{formatEventDatesShort(e.startDate, e.endDate)}</span>
        {place && <span className="tag">{place}</span>}
      </div>
      <AddToCalendar event={e} />
      {view && <a className="ev-view" href={view} target="_blank" rel="noopener noreferrer">View Event →</a>}
    </div>
  );
}
