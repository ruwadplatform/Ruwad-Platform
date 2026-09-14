import { api } from "./client";
import type { EventItem } from "@/types/intelligence";

interface RawEvent {
  id: string; name: string; date: string; location: string; country: string; type: string; sector: string;
  organizer: string; description: string; registrationStatus: EventItem["registrationStatus"]; url: string;
}

export async function fetchEvents(): Promise<EventItem[]> {
  const res = await api.get<{ items: RawEvent[] }>("/events?limit=100");
  return res.items.map((e) => ({
    id: e.id, name: e.name, date: e.date, location: e.location, country: e.country, type: e.type,
    sector: e.sector, organizer: e.organizer, description: e.description, registrationStatus: e.registrationStatus, url: e.url,
  }));
}
