"use client";

/** Thin React reactivity layer over lib/store.ts's plain localStorage
 * functions. The old app just calls a function then re-renders the whole
 * view via innerHTML; React needs an explicit subscription so a component
 * re-renders when another component's action (e.g. a save-star click)
 * changes the same underlying data. One custom event, dispatched by every
 * mutating store call, is enough — components re-read on each tick rather
 * than tracking fine-grained diffs, matching the old app's own
 * "re-render everything" mental model.
 *
 * Uses useSyncExternalStore (the correct primitive for this — plain
 * useState+useEffect syncing external state triggers React's
 * set-state-in-effect lint rule). Several store getters (getWatchlist(),
 * for one) build and return a brand new object every call, so the
 * snapshot is cached by value (JSON-compared) in a ref and only replaced
 * when the underlying data actually changed — otherwise
 * useSyncExternalStore's Object.is check never settles and loops forever. */
import { useCallback, useRef, useSyncExternalStore } from "react";
import * as store from "@/lib/store";
import type { WatchlistKind } from "@/lib/store";

/** Re-exported for the couple of callers outside this file that dispatch a
 * change manually after an optimistic mutation — the actual event
 * plumbing now lives in lib/store.ts so plain (non-hook) store functions
 * can trigger it too, e.g. after an async fetch resolves. */
export const notifyStoreChange = store.notifyStoreChange;

function useStoreValue<T>(getter: () => T, serverFallback: T): T {
  const cache = useRef<{ raw: string; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const next = getter();
    const raw = JSON.stringify(next);
    if (!cache.current || cache.current.raw !== raw) cache.current = { raw, value: next };
    return cache.current.value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useSyncExternalStore(store.subscribeStoreChange, getSnapshot, () => serverFallback);
}

export function useSession() {
  const user = useStoreValue(() => store.currentUser(), null);
  const hydrated = useStoreValue(() => store.isSessionHydrated(), false);
  return { user, loggedIn: !!user, isAdmin: user ? store.isAdmin() : false, hydrated };
}

export function useWatchlist() {
  return useStoreValue(() => store.getWatchlist(), store.emptyWatchlist());
}

export function useIsSaved(kind: WatchlistKind, id: string): boolean {
  return useStoreValue(() => store.isSaved(kind, id), false);
}

export function useToggleSaved() {
  return useCallback((kind: WatchlistKind, id: string) => {
    const result = store.toggleSaved(kind, id);
    notifyStoreChange();
    return result;
  }, []);
}

export function useNotifications() {
  const list = useStoreValue(() => store.getNotifications(), []);
  const unread = useStoreValue(() => store.unreadNotifCount(), 0);
  return { list, unread };
}

export function useIntros() {
  return useStoreValue(() => store.getIntros(), []);
}

export function useSavedSearches() {
  return useStoreValue(() => store.getSavedSearches(), []);
}

export function useSavedSearchActions() {
  return {
    remove: useCallback((id: string) => { store.deleteSavedSearch(id); notifyStoreChange(); }, []),
    rename: useCallback((id: string, label: string) => { store.renameSavedSearch(id, label); notifyStoreChange(); }, []),
    toggleAlert: useCallback((id: string) => { store.toggleSavedSearchAlert(id); notifyStoreChange(); }, []),
    markRun: useCallback((id: string) => { store.markSavedSearchRun(id); notifyStoreChange(); }, []),
  };
}

export function useOwnedListings() {
  return useStoreValue(() => store.getOwnedListings(), []);
}

export function useRecentActivity() {
  return useStoreValue(() => store.getRecentActivity(), []);
}

export function useMyStartupId() {
  return useStoreValue(() => store.getMyStartup(), null);
}

export function useSubmissions() {
  return useStoreValue(() => store.getSubmissions(), []);
}

export function useSettings() {
  const settings = useStoreValue(() => store.getSettings(), store.defaultSettings());
  const update = useCallback((patch: Partial<store.AccountSettings>) => { store.updateSettings(patch); notifyStoreChange(); }, []);
  return { settings, update };
}
