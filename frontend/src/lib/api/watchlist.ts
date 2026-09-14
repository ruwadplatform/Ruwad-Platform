import { api } from "./client";
import type { ApiWatchlistEntry, ApiWatchlistKind } from "./types";

export function fetchWatchlist(): Promise<ApiWatchlistEntry[]> {
  return api.get<ApiWatchlistEntry[]>("/watchlist");
}

export function toggleWatchlistBySlug(kind: ApiWatchlistKind, slug: string): Promise<{ saved: boolean }> {
  return api.post<{ saved: boolean }>("/watchlist/toggle", { kind, slug });
}
