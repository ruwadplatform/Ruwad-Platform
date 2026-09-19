/** Ported from js/store.js. Auth, watchlist, saved searches, introduction
 * requests, activity, settings and owned listings are now genuinely
 * backend-backed (real HTTP calls to the NestJS API — see src/lib/api/*)
 * instead of localStorage. Claims and Notifications remain localStorage
 * stubs — out of scope for the backend migration. Data Room / submission
 * drafts stay stubbed to a clean/empty state until that subsystem grows a
 * real frontend. */
import { flushSync } from "react-dom";
import * as authApi from "./api/auth";
import * as watchlistApi from "./api/watchlist";
import * as savedSearchesApi from "./api/saved-searches";
import * as introductionsApi from "./api/introductions";
import * as activityApi from "./api/activity";
import * as organizationsApi from "./api/organizations";
import * as submissionsApi from "./api/submissions";
import { ApiError } from "./api/client";
import type { ApiUser, ApiWatchlistKind, ApiSubmission, ApiSubmissionKind } from "./api/types";

export const LSK = {
  claims: "ruwad_claims",
  notifications: "ruwad_notifications",
} as const;

const PENDING_ACTION_KEY = "ruwad_pending_action";

function isBrowser() {
  return typeof window !== "undefined";
}

function lsGet<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function lsSet<T>(key: string, val: T): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(val));
}

/** Dispatched after every store mutation so useSyncExternalStore-based
 * hooks (src/hooks/use-store.ts, hooks/use-directory-data.ts) re-read and
 * re-render. flushSync matters here: this fires from contexts React
 * doesn't track (a resolved fetch promise, a setTimeout, etc.), and
 * without it the update reliably gets scheduled but not painted — the
 * component silently holds stale data until some unrelated interaction
 * forces the next render (confirmed: a real, reproducible bug, not a
 * timing fluke — startup/investor/etc. directories loaded fine over the
 * network but rendered 0 results on first paint until something else,
 * e.g. typing in the search box, triggered a render). */
const STORE_EVENT = "ruwad-store-change";
export function notifyStoreChange(): void {
  if (!isBrowser()) return;
  flushSync(() => window.dispatchEvent(new Event(STORE_EVENT)));
}
export function subscribeStoreChange(onChange: () => void): () => void {
  window.addEventListener(STORE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A small synchronous-read/async-populate cache — the bridge between
 * useSyncExternalStore's synchronous getSnapshot() and the fact that real
 * data now requires a network round trip. First read triggers a fetch in
 * the background and returns the fallback immediately; once the fetch
 * resolves, the cache updates and notifyStoreChange() triggers a re-render. */
function createResourceCache<T>(fallback: T) {
  let value = fallback;
  let loaded = false;
  let loading = false;
  return {
    get(): T {
      return value;
    },
    isLoaded(): boolean {
      return loaded;
    },
    set(v: T): void {
      value = v;
      loaded = true;
      notifyStoreChange();
    },
    reset(): void {
      value = fallback;
      loaded = false;
      loading = false;
    },
    ensureLoaded(fetcher: () => Promise<T>): void {
      if (loaded || loading) return;
      loading = true;
      fetcher()
        .then((v) => {
          value = v;
          loaded = true;
        })
        .catch(() => {
          // leave the fallback in place — the next ensureLoaded() call (e.g.
          // triggered by a re-render) will retry
        })
        .finally(() => {
          loading = false;
          notifyStoreChange();
        });
    },
  };
}

/* ------------------------------------------------------------------- SESSION
 * Real backend auth: the httpOnly `ruwad_token` cookie set by the API is
 * the actual source of authority for every write below — this local cache
 * just mirrors the last known /auth/me or /auth/login response so the rest
 * of the app (which reads session state synchronously) doesn't need to
 * become async-aware everywhere. */
export interface OrgInfo {
  name?: string;
  website?: string;
  stage?: string;
  category?: string;
  city?: string;
  type?: string;
}
export interface Account {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  accountType: string;
  jobTitle?: string;
  country?: string;
  city?: string;
  org?: OrgInfo;
  linkedin?: string;
  bio?: string;
  interests?: string[];
  /** Uploaded profile photo id; absent/null means show initials. */
  profileImageId?: string | null;
  createdAt: number;
  isAdmin?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  USER: "Explorer",
  FOUNDER: "Startup Founder",
  INVESTOR: "Investor",
  ORGANIZATION_ADMIN: "Organization",
  RUWAD_ADMIN: "Administrator",
  SUPER_ADMIN: "Administrator",
};

function toAccount(u: ApiUser): Account {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    accountType: ROLE_LABEL[u.role] ?? u.role,
    jobTitle: u.jobTitle ?? undefined,
    country: u.country ?? undefined,
    city: u.city ?? undefined,
    org: {
      name: u.organization ?? undefined,
      website: u.organizationWebsite ?? undefined,
      stage: u.organizationStage ?? undefined,
      category: u.organizationCategory ?? undefined,
      city: u.organizationCity ?? undefined,
      type: u.organizationType ?? undefined,
    },
    linkedin: u.linkedin ?? undefined,
    bio: u.bio ?? undefined,
    interests: u.interests ?? [],
    profileImageId: u.profileImageId ?? null,
    createdAt: Date.parse(u.createdAt),
    isAdmin: u.role === "RUWAD_ADMIN" || u.role === "SUPER_ADMIN",
  };
}

let sessionUser: ApiUser | null = null;
let sessionHydrated = false;

/** Called once at app boot (see AppBoot.tsx) to check the real cookie
 * session against the backend — this is what makes a page refresh keep you
 * logged in, since there is no localStorage session to read synchronously. */
export async function hydrateSession(): Promise<void> {
  if (sessionHydrated) return;
  try {
    sessionUser = await authApi.me();
  } catch {
    sessionUser = null;
  } finally {
    sessionHydrated = true;
    notifyStoreChange();
  }
}

export function isSessionHydrated(): boolean {
  return sessionHydrated;
}

function resetUserScopedCaches(): void {
  watchlistCache.reset();
  savedSearchesCache.reset();
  introsCache.reset();
  activityCache.reset();
  ownedListingsCache.reset();
  settingsCache.reset();
  submissionsCache.reset();
}

export async function login(email: string, password: string): Promise<Account> {
  const u = await authApi.login(email.trim(), password);
  sessionUser = u;
  sessionHydrated = true;
  resetUserScopedCaches();
  notifyStoreChange();
  return toAccount(u);
}

export async function registerAccount(input: {
  firstName: string; lastName: string; email: string; password: string;
  role?: string; jobTitle?: string; organization?: string;
  organizationWebsite?: string; organizationStage?: string; organizationCategory?: string;
  organizationCity?: string; organizationType?: string;
  country?: string; city?: string; interests?: string[];
}): Promise<Account> {
  const u = await authApi.register(input);
  sessionUser = u;
  sessionHydrated = true;
  resetUserScopedCaches();
  notifyStoreChange();
  return toAccount(u);
}

export async function clearSession(): Promise<void> {
  try {
    await authApi.logout();
  } finally {
    sessionUser = null;
    resetUserScopedCaches();
    notifyStoreChange();
  }
}

export async function updateProfile(patch: Partial<Pick<Account, "firstName" | "lastName" | "jobTitle" | "city" | "country" | "bio" | "linkedin" | "interests">> & { orgName?: string; org?: OrgInfo }): Promise<void> {
  const u = await authApi.updateProfile({
    firstName: patch.firstName, lastName: patch.lastName, jobTitle: patch.jobTitle,
    country: patch.country, city: patch.city, bio: patch.bio, linkedin: patch.linkedin,
    organization: patch.orgName ?? patch.org?.name,
    organizationWebsite: patch.org?.website, organizationStage: patch.org?.stage,
    organizationCategory: patch.org?.category, organizationCity: patch.org?.city, organizationType: patch.org?.type,
    interests: patch.interests,
  });
  sessionUser = u;
  notifyStoreChange();
}

/** Sets (or, with null, removes) the profile photo and pushes the updated
 * user through the same session store the header/dropdown/profile page read
 * from, so all of them re-render immediately — no refresh needed. */
export async function updateProfilePhoto(profileImageId: string | null): Promise<void> {
  const u = await authApi.updateProfile({ profileImageId });
  sessionUser = u;
  notifyStoreChange();
}

export function isLoggedIn(): boolean {
  return !!sessionUser;
}
export function currentUser(): Account | null {
  return sessionUser ? toAccount(sessionUser) : null;
}
export function isAdmin(): boolean {
  return !!currentUser()?.isAdmin;
}

/* ------------------------------------------------------------------ WATCHLIST */
export type WatchlistKind = "startups" | "investors" | "reports" | "programs" | "hubs" | "research" | "multinationals";
export type Watchlist = Record<WatchlistKind, string[]>;

export function emptyWatchlist(): Watchlist {
  return { startups: [], investors: [], reports: [], programs: [], hubs: [], research: [], multinationals: [] };
}

const WATCHLIST_KIND_TO_API: Partial<Record<WatchlistKind, ApiWatchlistKind>> = {
  startups: "STARTUP", investors: "INVESTOR", hubs: "HUB", research: "RESEARCH", multinationals: "MULTINATIONAL", reports: "REPORT",
};

const watchlistCache = createResourceCache<Watchlist>(emptyWatchlist());

export function getWatchlist(): Watchlist {
  if (!isLoggedIn()) return emptyWatchlist();
  watchlistCache.ensureLoaded(async () => {
    const rows = await watchlistApi.fetchWatchlist();
    const w = emptyWatchlist();
    for (const row of rows) {
      const kind = (Object.keys(WATCHLIST_KIND_TO_API) as WatchlistKind[]).find((k) => WATCHLIST_KIND_TO_API[k] === row.kind);
      if (kind && row.slug) w[kind].push(row.slug);
    }
    return w;
  });
  return watchlistCache.get();
}
export function isSaved(kind: WatchlistKind, id: string): boolean {
  return (getWatchlist()[kind] || []).includes(id);
}
const KIND_LABEL: Record<WatchlistKind, string> = {
  startups: "startup", investors: "investor", hubs: "hub", research: "research institution",
  multinationals: "multinational", reports: "report", programs: "program",
};
/** Optimistic: flips the local cache immediately for a responsive star
 * click, fires the real API call in the background, and rolls back if it
 * fails. Returns the optimistic new state (matches the old synchronous
 * contract every caller already expects). */
export function toggleSaved(kind: WatchlistKind, id: string): boolean {
  if (!requireAuth("save-" + kind, { kind, id })) return false;
  const apiKind = WATCHLIST_KIND_TO_API[kind];
  if (!apiKind) return false;

  const w = { ...getWatchlist(), [kind]: [...(getWatchlist()[kind] || [])] };
  const i = w[kind].indexOf(id);
  const nowSaved = i === -1;
  if (i > -1) w[kind].splice(i, 1);
  else w[kind].push(id);
  watchlistCache.set(w);

  watchlistApi.toggleWatchlistBySlug(apiKind, id).catch(() => {
    watchlistCache.reset();
    getWatchlist();
  });
  void KIND_LABEL; // labels now assigned server-side in the activity log text
  return nowSaved;
}

/* ------------------------------------------------------------- INTRODUCTION REQUESTS */
export interface IntroStatusEvent {
  status: string;
  date: string;
}
export interface IntroRequest {
  id: string;
  userEmail: string;
  date: string;
  status: string;
  investor?: string;
  startup?: string;
  reasonType?: string;
  reason?: string;
  message?: string;
  updatedAt?: string;
  statusHistory?: IntroStatusEvent[];
}
const introsCache = createResourceCache<IntroRequest[]>([]);

function mapIntro(r: Awaited<ReturnType<typeof introductionsApi.fetchIntroductions>>[number]): IntroRequest {
  return {
    id: r.id,
    userEmail: sessionUser?.email ?? "",
    date: r.createdAt.slice(0, 10),
    status: r.status.charAt(0) + r.status.slice(1).toLowerCase().replace(/_/g, " "),
    investor: r.investor ?? undefined,
    startup: r.startup ?? undefined,
    reasonType: r.reasonType ?? undefined,
    reason: r.reason ?? undefined,
    message: r.message ?? undefined,
    updatedAt: r.updatedAt.slice(0, 10),
    statusHistory: r.statusHistory,
  };
}

export function getIntros(): IntroRequest[] {
  if (!isLoggedIn()) return [];
  introsCache.ensureLoaded(async () => (await introductionsApi.fetchIntroductions()).map(mapIntro));
  return introsCache.get();
}
export function addIntro(req: Partial<IntroRequest>): void {
  if (!isLoggedIn()) return;
  introductionsApi
    .createIntroduction({ investor: req.investor, startup: req.startup, reasonType: req.reasonType, reason: req.reason, message: req.message })
    .then((created) => {
      introsCache.set([mapIntro(created), ...introsCache.get()]);
    });
}

/* --------------------------------------------------------------------- CLAIMS */
export interface Claim {
  id: string;
  startupId: string;
  claimantEmail: string;
  role: string;
  note: string;
  status: string;
  requestedAt: number;
}
export function getClaims(): Claim[] {
  return lsGet(LSK.claims, []);
}
function setClaims(list: Claim[]): void {
  lsSet(LSK.claims, list);
}
export function getClaimForStartup(startupId: string): Claim | null {
  return getClaims().find((c) => c.startupId === startupId) || null;
}
export function getMyClaim(): Claim | null {
  const u = currentUser();
  if (!u) return null;
  return getClaims().find((c) => c.claimantEmail === u.email) || null;
}
export function submitClaim(startupId: string, payload: { role: string; note?: string }): Claim | null {
  if (!requireAuth("claim-company", { startupId })) return null;
  const u = currentUser()!;
  if (getClaimForStartup(startupId) || getMyClaim()) return null;
  const claim: Claim = { id: "claim-" + Date.now(), startupId, claimantEmail: u.email, role: payload.role, note: payload.note || "", status: "Pending Review", requestedAt: Date.now() };
  const list = getClaims();
  list.push(claim);
  setClaims(list);
  return claim;
}

/* -------------------------------------------------------------- NOTIFICATIONS */
export interface Notification {
  id: string;
  text: string;
  date: string;
  read: boolean;
}
export function getNotifications(): Notification[] {
  const u = currentUser();
  if (!u) return [];
  return lsGet<Record<string, Notification[]>>(LSK.notifications, {})[u.email] || [];
}
function setNotifications(list: Notification[]): void {
  const u = currentUser();
  if (!u) return;
  const all = lsGet<Record<string, Notification[]>>(LSK.notifications, {});
  all[u.email] = list;
  lsSet(LSK.notifications, all);
}
export function markAllNotificationsRead(): void {
  setNotifications(getNotifications().map((n) => ({ ...n, read: true })));
}
export function unreadNotifCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

/* ------------------------------------------------------------------ SETTINGS */
export interface AccountSettings {
  emailNotifications: boolean;
  introRequestAlerts: boolean;
  savedSearchAlerts: boolean;
  weeklyDigest: boolean;
  profileVisibleToGuests: boolean;
  showContactInfo: boolean;
}
export function defaultSettings(): AccountSettings {
  return { emailNotifications: true, introRequestAlerts: true, savedSearchAlerts: true, weeklyDigest: false, profileVisibleToGuests: true, showContactInfo: false };
}
const settingsCache = createResourceCache<AccountSettings>(defaultSettings());
export function getSettings(): AccountSettings {
  if (!isLoggedIn()) return defaultSettings();
  settingsCache.ensureLoaded(() => authApi.getSettings());
  return settingsCache.get();
}
export function updateSettings(patch: Partial<AccountSettings>): void {
  if (!isLoggedIn()) return;
  const optimistic = { ...getSettings(), ...patch };
  settingsCache.set(optimistic);
  authApi.updateSettings(patch).then((saved) => settingsCache.set(saved));
}

/* ------------------------------------------------ RETURN-CONTEXT (guest -> login -> resume) */
export interface PendingAction {
  type: string;
  payload: unknown;
  route: string;
}
export function requireAuth(actionType: string, payload: unknown): boolean {
  if (isLoggedIn()) return true;
  const pending: PendingAction = { type: actionType, payload, route: isBrowser() ? window.location.pathname : "" };
  lsSet(PENDING_ACTION_KEY, pending);
  // This is a plain module with no access to next/navigation's router (it's
  // called from outside React, e.g. non-hook store functions) — a full
  // navigation is the only option here, same tradeoff the old app's own
  // location.hash redirect made.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (isBrowser()) window.location.href = "/login";
  return false;
}
export function consumePendingAction(): PendingAction | null {
  const a = lsGet<PendingAction | null>(PENDING_ACTION_KEY, null);
  if (isBrowser()) localStorage.removeItem(PENDING_ACTION_KEY);
  return a;
}

/** For a guest who landed on an auth-gated page directly (WorkspaceGate) —
 * stashes the current route so login/signup can return them here, without
 * requireAuth's own forced full-page navigation (the caller already has a
 * router and just needs the return route remembered first). */
export function stashReturnRoute(route: string): void {
  lsSet<PendingAction>(PENDING_ACTION_KEY, { type: "route", payload: null, route });
}

/* ------------------------------------------------------------ SAVED SEARCHES */
export interface SavedSearch {
  id: string;
  entityType: string;
  label: string;
  search: string;
  filters: Record<string, string[]>;
  resultCountAtSave: number;
  createdAt: number;
  lastRunAt?: number;
  alertEnabled?: boolean;
}
const savedSearchesCache = createResourceCache<SavedSearch[]>([]);

function mapSavedSearch(s: Awaited<ReturnType<typeof savedSearchesApi.fetchSavedSearches>>[number]): SavedSearch {
  return {
    id: s.id, entityType: s.entityType, label: s.label, search: s.search, filters: s.filters,
    resultCountAtSave: s.resultCountAtSave, createdAt: Date.parse(s.createdAt),
    lastRunAt: s.lastRunAt ? Date.parse(s.lastRunAt) : undefined, alertEnabled: s.alertEnabled,
  };
}

export function getSavedSearches(): SavedSearch[] {
  if (!isLoggedIn()) return [];
  savedSearchesCache.ensureLoaded(async () => (await savedSearchesApi.fetchSavedSearches()).map(mapSavedSearch));
  return savedSearchesCache.get();
}
export function saveSearch(entityType: string, label: string, search: string, filters: Record<string, string[]>, resultCount: number): boolean {
  if (!requireAuth("save-search", { entityType })) return false;
  savedSearchesApi.createSavedSearch({ entityType, label, search, filters, resultCount }).then((created) => {
    savedSearchesCache.set([mapSavedSearch(created), ...savedSearchesCache.get()]);
  });
  return true;
}
export function deleteSavedSearch(id: string): void {
  savedSearchesCache.set(savedSearchesCache.get().filter((s) => s.id !== id));
  savedSearchesApi.deleteSavedSearch(id).catch(() => {
    savedSearchesCache.reset();
    getSavedSearches();
  });
}
export function renameSavedSearch(id: string, label: string): void {
  savedSearchesCache.set(savedSearchesCache.get().map((s) => (s.id === id ? { ...s, label } : s)));
  savedSearchesApi.renameSavedSearch(id, label);
}
export function toggleSavedSearchAlert(id: string): void {
  const current = savedSearchesCache.get().find((s) => s.id === id);
  const next = !current?.alertEnabled;
  savedSearchesCache.set(savedSearchesCache.get().map((s) => (s.id === id ? { ...s, alertEnabled: next } : s)));
  savedSearchesApi.toggleSavedSearchAlert(id, next);
}
export function markSavedSearchRun(id: string): void {
  savedSearchesCache.set(savedSearchesCache.get().map((s) => (s.id === id ? { ...s, lastRunAt: Date.now() } : s)));
  savedSearchesApi.markSavedSearchRun(id);
}

/* --------------------------------------------------------------- DATA ROOM
 * (still a stub — Data Room/NDA is explicitly out of scope for the listing
 * submission system built alongside SUBMISSIONS below). */
export function getMyDataRoomSummary(): { pendingSignature: number; active: number } {
  return { pendingSignature: 0, active: 0 };
}

/* ----------------------------------------------------------------- SUBMISSIONS
 * Real backend-backed listing submissions — draft → submit → admin review →
 * approve/publish. See backend/src/submissions. Never localStorage: every
 * mutation below round-trips to Postgres immediately. */
const submissionsCache = createResourceCache<ApiSubmission[]>([]);

export function getSubmissions(): ApiSubmission[] {
  if (!isLoggedIn()) return [];
  submissionsCache.ensureLoaded(() => submissionsApi.fetchMySubmissions());
  return submissionsCache.get();
}

function upsertSubmissionInCache(s: ApiSubmission): void {
  const list = submissionsCache.get();
  const i = list.findIndex((x) => x.id === s.id);
  const next = i === -1 ? [s, ...list] : list.map((x) => (x.id === s.id ? s : x));
  submissionsCache.set(next);
}
function removeSubmissionFromCache(id: string): void {
  submissionsCache.set(submissionsCache.get().filter((x) => x.id !== id));
}

export async function createDraftSubmission(kind: ApiSubmissionKind): Promise<ApiSubmission> {
  const created = await submissionsApi.createSubmission(kind);
  upsertSubmissionInCache(created);
  return created;
}
export async function saveSubmissionDraft(id: string, patch: { payload?: Record<string, unknown>; currentStep?: string; completionPercentage?: number; title?: string }): Promise<ApiSubmission> {
  const saved = await submissionsApi.updateSubmission(id, patch);
  upsertSubmissionInCache(saved);
  return saved;
}
export async function submitSubmissionForReview(id: string): Promise<ApiSubmission> {
  const saved = await submissionsApi.submitSubmission(id);
  upsertSubmissionInCache(saved);
  return saved;
}
export async function deleteDraftSubmission(id: string): Promise<void> {
  await submissionsApi.deleteSubmission(id);
  removeSubmissionFromCache(id);
}
/** Draft or changes-requested submission a "continue" flow can jump into —
 * one per entity kind is assumed (the wizard never lets a user hold two
 * simultaneous drafts of the same kind open). */
export function findResumableSubmission(kind: ApiSubmissionKind): ApiSubmission | null {
  return getSubmissions().find((s) => s.kind === kind && (s.status === "DRAFT" || s.status === "CHANGES_REQUESTED")) ?? null;
}

/* -------------------------------------------------------------------- WORKSPACE
 * Owned listings are entity-membership rows on the backend (see
 * OrganizationsModule) resolved against the real directory tables — never
 * duplicated records. */
export type ListingKind = "startups" | "investors" | "hubs" | "research" | "multinationals";
export type ListingStatus = "Published" | "Draft" | "Under Review" | "Changes Requested";
export interface Listing {
  id: string;
  /** The entity's raw database id — distinct from `id` above (the slug),
   * needed to cross-reference against Submission.publishedEntityId. */
  entityId: string;
  type: ListingKind;
  status: ListingStatus;
  visibility: "Public" | "Unlisted";
  lastUpdated: string;
  views: number;
}

const API_KIND_TO_LISTING_TYPE: Record<string, ListingKind> = {
  STARTUP: "startups", INVESTOR: "investors", HUB: "hubs", RESEARCH: "research", MULTINATIONAL: "multinationals",
};
const LISTING_STATUS_LABEL: Record<string, ListingStatus> = {
  PUBLISHED: "Published", DRAFT: "Draft", UNDER_REVIEW: "Under Review", CHANGES_REQUESTED: "Changes Requested",
};

const ownedListingsCache = createResourceCache<Listing[]>([]);

export function getOwnedListings(): Listing[] {
  if (!isLoggedIn()) return [];
  ownedListingsCache.ensureLoaded(async () => {
    const rows = await organizationsApi.fetchMyListings();
    return rows.map((r) => ({
      id: r.slug,
      entityId: r.entityId,
      type: API_KIND_TO_LISTING_TYPE[r.kind] ?? "startups",
      status: LISTING_STATUS_LABEL[r.listingStatus] ?? "Published",
      visibility: r.listingVisibility === "UNLISTED" ? "Unlisted" : "Public",
      lastUpdated: r.lastUpdated.slice(0, 10),
      views: r.views,
    }));
  });
  return ownedListingsCache.get();
}

export interface ActivityItem {
  id: string;
  type: "watchlist_add" | "search_saved" | "intro_submitted" | "listing_edited" | "profile_viewed" | "profile_updated";
  text: string;
  date: string;
  route?: string;
}
const activityCache = createResourceCache<ActivityItem[]>([]);

export function getRecentActivity(): ActivityItem[] {
  if (!isLoggedIn()) return [];
  activityCache.ensureLoaded(async () => {
    const rows = await activityApi.fetchActivity();
    return rows.map((r) => ({ id: r.id, type: r.type as ActivityItem["type"], text: r.text, date: r.createdAt.slice(0, 10), route: r.route ?? undefined }));
  });
  return activityCache.get();
}

/** The founder/admin-managed startup record for the current account — the
 * first STARTUP-kind owned listing, resolved from real membership data. */
export function getMyStartup(): string | null {
  const startup = getOwnedListings().find((l) => l.type === "startups");
  return startup?.id ?? null;
}

export { ApiError };
