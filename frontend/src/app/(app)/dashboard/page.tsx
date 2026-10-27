import Link from "next/link";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { JsonLd } from "@/lib/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";
import { HOME_PATH, siteJsonLd } from "@/lib/seo/site-jsonld";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from "@/lib/seo/site";

/** The Dashboard IS the RUWĀD home page: the root address permanently redirects here (next.config.ts), so this is the one address that carries the brand title, description, canonical and
 * social tags. For a visitor who is not signed in it shows the public ecosystem view (hero, featured profiles, snapshot); a signed-in member sees their own. */
export const metadata = pageMetadata({ title: DEFAULT_TITLE, absoluteTitle: true, description: DEFAULT_DESCRIPTION, path: HOME_PATH });

export default function Page() {
  return (
    <>
      <JsonLd data={siteJsonLd()} />
      {/* The visible greeting appears once the sign-in state is known, so the page's one top-level heading is also in the page source for search engines. */}
      <h1 className="visually-hidden">{DEFAULT_TITLE}</h1>
      <DashboardPage />
      <nav className="dash-explore" aria-label="Explore RUWĀD">
        <span>Explore RUWĀD:</span>
        <Link href="/ecosystem">Healthcare ecosystem</Link>
        <Link href="/startups">Startups</Link>
        <Link href="/investors">Investors</Link>
        <Link href="/hubs">Hubs &amp; enablers</Link>
        <Link href="/research">Research</Link>
        <Link href="/multinationals">Multinational companies</Link>
        <Link href="/reports">Reports</Link>
        <Link href="/news">News &amp; events</Link>
      </nav>
    </>
  );
}
