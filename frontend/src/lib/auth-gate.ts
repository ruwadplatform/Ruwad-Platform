/** Ported verbatim from js/auth-gate.js's pure-logic pieces (isPublicViewer,
 * capForGuest, GUEST_ADVANCED_FILTER_KEYS). The markup-producing helpers
 * (lockedTeaser, directoryGateBannerHtml, openAuthGateModal,
 * guestAdvancedFilterGateHtml) are React components in components/shared/. */

export function capForGuest<T>(list: T[], n: number, isPublicViewer: boolean): { shown: T[]; hiddenCount: number; capped: boolean } {
  if (!isPublicViewer || list.length <= n) return { shown: list, hiddenCount: 0, capped: false };
  return { shown: list.slice(0, n), hiddenCount: list.length - n, capped: true };
}

/** Advanced-filter keys per directory that trigger the gate instead of
 * actually filtering, when the viewer is signed out. */
export const GUEST_ADVANCED_FILTER_KEYS: Record<string, string[]> = {
  startups: ["foundedMin", "foundedMax", "fundingMin", "fundingMax"],
  investors: ["focus"],
  hubs: ["healthcareFocus", "stage"],
  research: ["researchArea"],
  multinationals: ["saudiPresence"],
};
