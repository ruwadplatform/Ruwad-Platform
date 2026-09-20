import { api } from "./client";
import type { EventItem } from "@/types/intelligence";

interface RawEvent {
  id: string; name: string; date: string; startDate?: string | null; endDate?: string | null;
  location: string; country: string; city?: string | null; venue?: string | null; type: string; sector: string;
  organizer: string; description: string; url: string; registrationUrl?: string | null; imageUrl?: string | null;
  status?: EventItem["status"];
}

/** The API's default view is ONGOING + UPCOMING only — past events are never
 * requested here. */
export async function fetchEvents(): Promise<EventItem[]> {
  const res = await api.get<{ items: RawEvent[] }>("/events?limit=100");
  return res.items.map((e) => {
    const startDate = e.startDate ?? e.date;
    return {
      id: e.id, name: e.name, startDate, endDate: e.endDate ?? startDate, status: e.status ?? "UPCOMING",
      location: e.location, country: e.country, city: e.city ?? null, venue: e.venue ?? null, type: e.type, sector: e.sector,
      organizer: e.organizer, description: e.description, url: e.url, registrationUrl: e.registrationUrl ?? null, imageUrl: e.imageUrl ?? null,
    };
  });
}
