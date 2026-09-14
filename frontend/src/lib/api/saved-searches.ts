import { api } from "./client";
import type { ApiSavedSearch } from "./types";

export function fetchSavedSearches(): Promise<ApiSavedSearch[]> {
  return api.get<ApiSavedSearch[]>("/saved-searches");
}

export function createSavedSearch(input: { entityType: string; label: string; search?: string; filters?: Record<string, string[]>; resultCount?: number }): Promise<ApiSavedSearch> {
  return api.post<ApiSavedSearch>("/saved-searches", input);
}

export function renameSavedSearch(id: string, label: string): Promise<ApiSavedSearch> {
  return api.patch<ApiSavedSearch>(`/saved-searches/${id}`, { label });
}

export function toggleSavedSearchAlert(id: string, alertEnabled: boolean): Promise<ApiSavedSearch> {
  return api.patch<ApiSavedSearch>(`/saved-searches/${id}`, { alertEnabled });
}

export function markSavedSearchRun(id: string): Promise<ApiSavedSearch> {
  return api.post<ApiSavedSearch>(`/saved-searches/${id}/run`);
}

export function deleteSavedSearch(id: string): Promise<void> {
  return api.delete<void>(`/saved-searches/${id}`);
}
