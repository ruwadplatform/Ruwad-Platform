import Link from "next/link";
import { JsonLd } from "@/lib/seo/JsonLd";
import { ADVISORY_ENABLED, AFFILIATED_ORGANIZATION, DEFAULT_DESCRIPTION, LOGO_PATH, SITE_NAME, SITE_NAME_ARABIC, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { MemberRedirect } from "./MemberRedirect";

export interface HomeStartup { slug: string; name: string; tagline: string; city: string; category: string }

const AUDIENCES: { h: string; p: string; links: { href: string; label: string }[] }[] = [
  {
    h: "Healthcare startups",
    p: "List your company so investors, hubs and partners can find it, keep your profile current, and share confidential documents through a Data Room you control, with access granted only after an NDA.",
    links: [{ href: "/startups", label: "Browse startups" }, { href: "/submit/startup", label: "List your startup" }],
  },
  {
    h: "Investors",
    p: "Discover Saudi and MENA healthcare startups with structured profiles and a RUWĀD Score, compare them with the active investor community, save searches and watchlists, and request introductions or Data Room access.",
    links: [{ href: "/investors", label: "Explore investors" }],
  },
  {
    h: "Research institutions",
    p: "See the universities, research centres and academic medical institutions across Saudi Arabia, and the healthcare ventures translating research into products.",
    links: [{ href: "/research", label: "Research & academia" }],
  },
  {
    h: "Innovation hubs and enablers",
    p: "Accelerators, incubators, venture studios and government programmes can present their offers, and founders can find every open programme in one list.",
    links: [{ href: "/hubs", label: "Hubs & enablers" }, { href: "/opportunities", label: "Open opportunities" }],
  },
  {
    h: "Ecosystem partners",
    p: "Multinational healthcare companies, corporates and public bodies can scout partnership-ready startups, follow the sector's reports, and keep up with events and news.",
    links: [{ href: "/multinationals", label: "Multinational companies" }, { href: "/reports", label: "Reports" }, { href: "/news", label: "News & events" }],
  },
];

/** The public RUWĀD home page: plain, readable, server-rendered text for search engines and first-time visitors. Everything stated here is something the platform does today. */
export function HomePage({ startups }: { startups: HomeStartup[] }) {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: ["RUWAD", "Ruwad", "RUWĀD Platform", SITE_NAME_ARABIC],
    url: SITE_URL,
    logo: absoluteUrl(LOGO_PATH),
    description: DEFAULT_DESCRIPTION,
  };
  const site = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, alternateName: "RUWĀD Healthcare Platform", url: SITE_URL, inLanguage: "en", publisher: { "@id": `${SITE_URL}/#organization` } };

  return (
    <div className="home-page">
      <MemberRedirect />
      <JsonLd data={[org, site]} />

      <section className="eco-hero" aria-labelledby="home-title">
        <div className="eco-hero-in">
          <div className="eco-hero-main">
            <div className="eyebrow">Saudi &amp; MENA healthcare innovation</div>
            <h1 id="home-title">RUWĀD — Saudi Healthcare Innovation Ecosystem</h1>
            <p>
              RUWĀD ({SITE_NAME_ARABIC}, Arabic for pioneers) is an online platform that maps the healthcare innovation ecosystem of Saudi Arabia and the wider MENA region: healthcare,
              biotech and medtech startups, investors, research institutions, innovation hubs and multinational healthcare companies, in one searchable place.
            </p>
            <div className="eco-hero-cta">
              <Link href="/ecosystem" className="btn btn-primary">Explore the ecosystem</Link>
              <Link href="/signup" className="btn" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}>Create a free account</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-what">
        <h2 id="home-what">What RUWĀD is</h2>
        <p>
          The RUWĀD healthcare platform brings together the people and organisations that build healthcare in the Kingdom. Each startup, investor, hub, research institution and
          multinational company has a profile; startup profiles carry a RUWĀD Score, with the factors behind it and how complete and recent the information is.
          Members can save searches, follow companies, request introductions and request access to confidential Data Rooms. Free accounts see the public profiles; members unlock
          the full directories and market intelligence.
        </p>
        <p>RUWĀD is available at ruwad.studio. It is a platform for discovery and relationships: it does not give investment, clinical or regulatory advice.</p>
      </section>

      <section className="home-section" aria-labelledby="home-who">
        <h2 id="home-who">Who RUWĀD is for</h2>
        <div className="home-grid">
          {AUDIENCES.map((a) => (
            <article key={a.h} className="panel panel-pad home-card">
              <h3>{a.h}</h3>
              <p>{a.p}</p>
              <p className="home-links">{a.links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-explore">
        <h2 id="home-explore">Explore the RUWĀD healthcare ecosystem</h2>
        <ul className="home-linklist">
          <li><Link href="/ecosystem">The Saudi healthcare ecosystem</Link>: companies, investors, enablers and institutions at a glance</li>
          <li><Link href="/startups">Startups</Link>: Saudi and MENA healthcare, biotech and medtech startups</li>
          <li><Link href="/investors">Investors</Link>: venture capital, corporate venture, sovereign and angel investors active in healthcare</li>
          <li><Link href="/hubs">Hubs &amp; enablers</Link>: accelerators, incubators, venture studios and programmes</li>
          <li><Link href="/research">Research &amp; academia</Link>: universities and academic healthcare centres</li>
          <li><Link href="/multinationals">Multinational healthcare companies</Link> active in Saudi Arabia and MENA</li>
          <li><Link href="/market-map">Market map</Link>, <Link href="/reports">reports</Link> and <Link href="/news">news &amp; events</Link></li>
          {ADVISORY_ENABLED && <li><Link href="/discover/advisory-services">RUWĀD Advisory Services</Link>: consultations with professors, researchers and professional advisors</li>}
        </ul>
      </section>

      {startups.length > 0 && (
        <section className="home-section" aria-labelledby="home-latest">
          <h2 id="home-latest">Recently updated healthcare startups</h2>
          <ul className="home-startups">
            {startups.map((s) => (
              <li key={s.slug}>
                <Link href={`/startups/${encodeURIComponent(s.slug)}`}>{s.name}</Link>
                <span className="muted small"> {[s.category, s.city].filter(Boolean).join(" · ")}</span>
                {s.tagline && <p className="small">{s.tagline}</p>}
              </li>
            ))}
          </ul>
          <p><Link href="/startups">See all startups</Link></p>
        </section>
      )}

      {AFFILIATED_ORGANIZATION && (
        <section className="home-section" aria-labelledby="home-about">
          <h2 id="home-about">About</h2>
          <p>RUWĀD is connected with {AFFILIATED_ORGANIZATION.url ? <a href={AFFILIATED_ORGANIZATION.url} rel="noopener">{AFFILIATED_ORGANIZATION.name}</a> : AFFILIATED_ORGANIZATION.name}.</p>
        </section>
      )}
    </div>
  );
}
