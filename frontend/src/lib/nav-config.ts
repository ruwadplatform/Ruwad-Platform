import type { RuwadIconName } from "@/components/icons/ruwad-icon";
import { categoriesFromParams, startupsUrl } from "@/lib/startup-category";

export interface NavChild {
  label: string;
  icon: RuwadIconName;
  route: string;
  auth?: boolean;
}
export interface NavGroup {
  id: string;
  label: string;
  icon?: RuwadIconName;
  route?: string;
  children?: NavChild[];
}

/** Ported verbatim from TOP_NAV in js/nav.js — same ids/labels/icons/order.
 * Routes are real Next.js paths instead of #/hash routes; anything not yet
 * built in this rewrite will 404 until its phase lands (expected during
 * the phased migration, not a bug — matches the old app's own comment). */
export const TOP_NAV: NavGroup[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", route: "/dashboard" },
  {
    id: "discover", label: "Discover",
    children: [
      { label: "Healthcare Ecosystem", icon: "ecosystem", route: "/ecosystem" },
      { label: "Market Map", icon: "bi", route: "/market-map" },
      { label: "Opportunities Marketplace", icon: "hubs", route: "/opportunities" },
      { label: "Biotechnology", icon: "research", route: startupsUrl(["Biotechnology"]) },
      { label: "MedTech", icon: "settings", route: startupsUrl(["MedTech"]) },
      { label: "Digital Health", icon: "cloud", route: startupsUrl(["Digital Health"]) },
    ],
  },
  {
    id: "explore", label: "Explore",
    children: [
      { label: "Screener", icon: "search", route: "/screener" },
      { label: "Startups", icon: "startups", route: "/startups" },
      { label: "Investors", icon: "investors", route: "/investors" },
      { label: "Hubs & Enablers", icon: "hubs", route: "/hubs" },
      { label: "Multinational", icon: "corp", route: "/multinationals" },
      { label: "Research & Academia", icon: "research", route: "/research" },
    ],
  },
  {
    id: "intelligence", label: "Intelligence",
    children: [
      { label: "Reports", icon: "reports", route: "/reports" },
      { label: "Dashboards", icon: "bi", route: "/analytics" },
      { label: "News & Events", icon: "news", route: "/news" },
    ],
  },
  {
    id: "workspace", label: "Workspace",
    children: [
      { label: "Overview", icon: "dashboard", route: "/workspace", auth: true },
      { label: "My Startup", icon: "mystartup", route: "/workspace/startup", auth: true },
      { label: "My Organizations", icon: "listings", route: "/my-organizations", auth: true },
      { label: "Submit a Listing", icon: "plus", route: "/submit", auth: true },
      { label: "Watchlist", icon: "watchlist", route: "/watchlist", auth: true },
      { label: "Saved Searches", icon: "search", route: "/saved-searches", auth: true },
      { label: "Introduction Requests", icon: "intros", route: "/introductions", auth: true },
      { label: "My NDAs", icon: "lock", route: "/my-ndas", auth: true },
    ],
  },
  {
    id: "admin", label: "Admin",
    children: [{ label: "Company Submissions", icon: "reports", route: "/admin/submissions", auth: true }],
  },
];

const ROUTE_TO_NAV_GROUP: Record<string, string> = {
  dashboard: "dashboard",
  ecosystem: "discover", "market-map": "discover", sector: "discover", opportunities: "discover",
  investors: "explore", hubs: "explore", multinationals: "explore",
  research: "explore", screener: "explore",
  reports: "intelligence", analytics: "intelligence", news: "intelligence",
  workspace: "workspace", "my-organizations": "workspace", watchlist: "workspace",
  "saved-searches": "workspace", introductions: "workspace", "my-ndas": "workspace",
  submit: "workspace", submissions: "workspace",
  admin: "admin",
};

/** Ported from activeNavGroup(route) — pathname-based instead of
 * route.name/hash-based, same category logic. */
export function activeNavGroup(pathname: string, search: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
  if (seg === "startups") {
    const cats = categoriesFromParams(new URLSearchParams(search));
    return cats.length === 1 && ["Biotechnology", "MedTech", "Digital Health"].includes(cats[0]) ? "discover" : "explore";
  }
  return ROUTE_TO_NAV_GROUP[seg] || (seg === "dashboard" ? "dashboard" : null);
}

/** Ported from visibleTopNav() — same filtering rules for guests
 * (Dashboard/Workspace/Admin hidden entirely, Opportunities Marketplace
 * dropped from Discover) vs. logged-in non-admins (Admin hidden only). */
export function visibleTopNav(loggedIn: boolean, admin: boolean): NavGroup[] {
  if (loggedIn) return admin ? TOP_NAV : TOP_NAV.filter((t) => t.id !== "admin");
  return TOP_NAV.filter((t) => t.id !== "dashboard" && t.id !== "workspace" && t.id !== "admin").map((t) =>
    t.id === "discover" && t.children ? { ...t, children: t.children.filter((c) => c.route !== "/opportunities") } : t,
  );
}
