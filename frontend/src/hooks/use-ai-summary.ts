"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { fetchAiSummary, type AiSummaryEntityType, type AiSummaryReady, type AiSummaryResult } from "@/lib/api/ai-summaries";

export type AiSummaryState =
  | { phase: "loading" }
  | { phase: "ready"; data: AiSummaryReady }
  | { phase: "unavailable"; reason: "insufficient_data" | "provider_not_configured" }
  | { phase: "error"; message: string; detail?: string };

/** Summaries already fetched in this tab, so re-opening the same organization is instant. The server keeps the durable cache and
 * decides when a summary is stale; this only avoids a round trip while the page is open. */
const memory = new Map<string, AiSummaryReady>();
const keyOf = (type: AiSummaryEntityType, id: string) => `${type}:${id}`;

function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Please sign in to view AI summaries.";
    if (e.status === 404) return "This organization could not be found.";
    if (e.status === 429) return "Too many requests right now. Please wait a moment and try again.";
    if (e.status === 503) return "The AI summary couldn't be generated right now. Please try again.";
  }
  return "We couldn't load this summary. Check your connection and try again.";
}

export function useAISummary(type: AiSummaryEntityType, id: string): AiSummaryState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${type}:${id}:${attempt}`;
  // The outcome of the latest request, tagged with the request it belongs to; anything else counts as "still loading".
  const [outcome, setOutcome] = useState<{ key: string; state: Exclude<AiSummaryState, { phase: "loading" }> } | null>(null);
  const remembered = memory.get(keyOf(type, id));

  useEffect(() => {
    if (remembered) return;
    let cancelled = false;
    fetchAiSummary(type, id).then(
      (r: AiSummaryResult) => {
        if (cancelled) return;
        if (r.status === "ready") { memory.set(keyOf(type, id), r); setOutcome({ key: requestKey, state: { phase: "ready", data: r } }); }
        else setOutcome({ key: requestKey, state: { phase: "unavailable", reason: r.reason } });
      },
      (e: unknown) => { if (!cancelled) setOutcome({ key: requestKey, state: { phase: "error", message: messageFor(e), detail: e instanceof ApiError ? e.detail : undefined } }); },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const state: AiSummaryState = remembered ? { phase: "ready", data: remembered } : outcome && outcome.key === requestKey ? outcome.state : { phase: "loading" };
  const retry = useCallback(() => { memory.delete(keyOf(type, id)); setAttempt((n) => n + 1); }, [type, id]);
  return { ...state, retry };
}
