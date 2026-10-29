"use client";

import { useEffect, useState } from "react";
import { fetchAdvisoryStatus } from "@/lib/api/advisory";
import { bookingsOpenFrom } from "./booking-availability";

/** Whether the server has opened online consultation booking. The directory shows one card per advisor and each asks, so the answer is shared for a short
 * while instead of being fetched many times. It FAILS CLOSED: if the server can't be asked, or answers anything other than an explicit "yes", booking is
 * treated as not open. (The server refuses every booking route itself; this only decides what the screens say.) */
const FRESH_MS = 30_000;
let cached: { at: number; open: Promise<boolean> } | null = null;

/** `fresh` skips the short-lived cache: used at the moment someone presses Confirm, so the decision is made on the server's current answer. */
export function fetchBookingsOpen(fresh = false): Promise<boolean> {
  if (!fresh && cached && Date.now() - cached.at < FRESH_MS) return cached.open;
  const open: Promise<boolean> = fetchAdvisoryStatus().then(bookingsOpenFrom, () => {
    if (cached?.open === open) cached = null; // a failed lookup is not remembered, the next screen asks again
    return false;
  });
  cached = { at: Date.now(), open };
  return open;
}

export type BookingsStatus = "loading" | "open" | "closed";

/** "open" only after the server said so; "loading" and "closed" both mean the screens must not promise a booking. */
export function useBookingsStatus(): BookingsStatus {
  const [status, setStatus] = useState<BookingsStatus>("loading");
  useEffect(() => {
    let alive = true;
    fetchBookingsOpen().then((open) => { if (alive) setStatus(open ? "open" : "closed"); });
    return () => { alive = false; };
  }, []);
  return status;
}
