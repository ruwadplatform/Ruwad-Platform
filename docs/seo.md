# RUWĀD search visibility (SEO)

Status: **implemented and tested locally; not deployed.** Nothing here changes the database, AWS, Supabase or any Vercel setting.

## 1. What the audit found (production, checked 2026-10-26)

| Finding | Detail |
|---|---|
| Canonical host | `https://www.ruwad.studio`. The bare `ruwad.studio` answers `308` to `www`. `ruwad-platform.vercel.app` still serves the same pages with no redirect (duplicate content). |
| No home page | `/` answered `307 → /dashboard`, so the home address had no content of its own and a temporary redirect was the only thing a crawler saw. |
| Identical metadata everywhere | Every page, including login, sign-up and every profile, had the same title and description. No canonical, no Open Graph, no X/Twitter card, no structured data. |
| No `robots.txt`, no `sitemap.xml` | Both returned the app's 404 page. |
| Empty directory pages | `/startups`, `/investors` and the other directories send only a header to a crawler (about 60 characters of text); the list loads in the browser. Profile pages (`/startups/<slug>` and the like) were server-rendered, but with the generic title. |
| No heading on server output | The directory pages' `<h1>` only appears after the browser runs the page. |
| Private pages indexable | Nothing marked sign-in, dashboard, settings, admin or workspace pages as off limits. |
| Favicon | A default framework icon (fixed earlier). |
| **Gated data is in the page source** | See section 6: the public API returns contact details, funding and market data that the screens hide behind a sign-in, and profile pages ship them in their HTML. This is not caused by SEO work, but it matters now that profiles are indexable. |

## 2. What was built

- **Site-wide:** `metadataBase`, a title template ("Page | RUWĀD"), default description, Open Graph and X cards, the share image (`public/og/ruwad-share.png`, 1200 × 630), the tab icon, and an optional Search Console verification tag (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`).
- **Home page (`/`)**: a real, server-rendered page (replaces the redirect) with one `<h1>`, what RUWĀD is, who it is for (startups, investors, research institutions, innovation hubs, ecosystem partners), links into every public section, and the most recently updated startups. Signed-in members are still sent on to the Dashboard. `Organization` and `WebSite` structured data.
- **Directory pages:** unique title, description and canonical for `/startups`, `/investors`, `/hubs`, `/research`, `/multinationals`, `/ecosystem`, `/opportunities`, `/reports`, `/news` and `/market-map`. The five record directories also carry a plain server-rendered list of every public profile under the interactive list, so each profile is one ordinary link from the page.
- **Profile pages:** a specific title and description built from the profile's own public facts ("Clinicy — Digital Health startup in Riyadh | RUWĀD"), canonical URL, social tags, and a schema.org `ProfilePage` whose subject is an `Organization` (name, description, city and country, founding year). **Never** contact details, scores, funding, team, or anything behind the sign-in (a test enforces this).
- **`robots.txt`** (`src/app/robots.ts`) and **`sitemap.xml`** (`src/app/sitemap.ts`, refreshed hourly): the sitemap lists the public pages and the public profiles only. A unit test fails if any private route could appear in it or be blocked while listed.
- **Private pages** (admin, workspace, my-*, profile, settings, introductions, watchlist, saved searches, submissions, submit, analytics, screener, search, and the sign-in and password pages, and the Dashboard) carry `noindex` through a layout in each route. `robots.txt` also blocks the ones that were never public. A test fails if a new top-level route is added without deciding whether it is public or private (`src/lib/seo/routes.ts`).
- **Production versus staging:** only the real production deployment is indexable (`VERCEL_ENV=production`). Previews and local builds say `noindex` on every page, serve `Disallow: /` and an empty sitemap. The older `*.vercel.app` addresses get an `X-Robots-Tag: noindex` header and canonical tags pointing at `www.ruwad.studio`; `robots.txt` leaves them crawlable so search engines can see that instruction.
- **Accessibility and navigation:** a "Skip to main content" link, labelled navigation, labelled icon buttons and search box, `aria-expanded` on the menus.

### Keywords

Used naturally in titles, descriptions and the home page text: **RUWĀD / Ruwad**, **RUWĀD Platform**, **RUWĀD Healthcare Platform**, **RUWĀD Healthcare Ecosystem**, **Saudi healthcare innovation**, and the ruwad.studio address. The Arabic name روّاد is in the structured data and the home page.

Deliberately **not** claimed:
- **"Ruwad SA" / "Ruwad Studio" / "Ruwad KVS"** are not presented as company names: the site does not claim any of them. "Studio" appears only as part of the address ruwad.studio. What "KVS" stands for, and the relationship to it, must be confirmed by you before anything is published. When you confirm, fill in `AFFILIATED_ORGANIZATION` in `src/lib/seo/site.ts` (name and optional link) and the home page will carry one sentence about it; nothing else changes.
- No social profile links are in the structured data because none were verified. Send the official LinkedIn and X addresses and they can be added as `sameAs`, which helps search engines tell RUWĀD apart from others using the same word.

## 3. Switches

| Setting | Effect |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Only if the production hostname ever changes (default `https://www.ruwad.studio`). |
| `SEO_INDEX_PROFILES=false` (build time) | Keeps every profile page out of search results, the sitemap and the public lists. Use it if you decide the data on profile pages must be reviewed first (section 6). |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Search Console's HTML-tag verification, if you prefer it to the DNS method. |
| `SEO_FORCE_INDEXING=true` | Local checking only: shows the production rules on a local build. Never set it on Vercel. |

## 4. Advisory Services

**Not part of this release.** Advisory Services is not deployed, so nothing about it is in the sitemap, the home page or the structured data. Its search work (its own titles and descriptions, crawlable advisor profiles, structured data only for real, approved advisors, demonstration advisors always `noindex` and never listed) is built on the advisory branch and goes live together with the feature. The home page only links to it if `NEXT_PUBLIC_ADVISORY_ENABLED=true`, which is not set.

## 5. Google Search Console, step by step

You need: the Google account that should own the property, and access to wherever the DNS for `ruwad.studio` is managed (the domain registrar, or Vercel if the domain's name servers are at Vercel).

1. **Verify the domain.**
   1. Open <https://search.google.com/search-console> and sign in.
   2. Click **Add property**, choose **Domain** (not "URL prefix"), enter `ruwad.studio`, click **Continue**.
   3. Google shows a TXT record that starts with `google-site-verification=`. Copy it.
   4. In the DNS settings, add a **TXT** record: name/host `@` (or blank), value the copied text. If the name servers are at Vercel: Vercel dashboard → the project → **Domains** → `ruwad.studio` → **DNS Records** → **Add** → type TXT. If the domain is at a registrar, add it in the registrar's DNS page.
   5. Wait a few minutes (it can take up to a day), return to Search Console and click **Verify**.
   - Alternative that needs no DNS access: add a **URL prefix** property `https://www.ruwad.studio/`, choose **HTML tag**, copy the content value, set it as `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` on Vercel, redeploy, then click Verify.
2. **Submit the sitemap** (after this work is deployed): **Sitemaps** in the left menu → under "Add a new sitemap" type `sitemap.xml` → **Submit**. Status should become "Success" and show the number of discovered pages.
3. **Request indexing of the home page:** paste `https://www.ruwad.studio/` into the search bar at the top (**URL inspection**) → wait for the report → **Test live URL** → **Request indexing**. Repeat for `/startups`, `/investors` and `/hubs` if you like. (Requests are limited per day; the sitemap does the rest.)
4. **Watch the target keywords:** **Performance → Search results** → **+ New → Query** → "Queries containing" `ruwad` (then `ruwād`, `ruwad platform`, `ruwad healthcare`, `ruwad advisory`). Switch on Clicks, Impressions, CTR and Position, and compare date ranges. Expect new pages to take days to weeks to appear, and branded results to settle over weeks. "Ruwad" is a common Arabic word used by other organisations, so competing results are normal.
5. **Find indexing problems:** **Indexing → Pages** lists why pages are not indexed. Expected and fine: "Excluded by 'noindex' tag" (the private pages), "Page with redirect" (the old home redirect), "Alternate page with proper canonical tag" (the `vercel.app` duplicates). Worth investigating: "Crawled, currently not indexed", "Server error (5xx)", "Soft 404". Use **URL inspection** on any page for the details, and check **Sitemaps** and **Core Web Vitals** from time to time.

Also worth doing: import the property into **Bing Webmaster Tools** (it can import from Search Console in one click); it covers Bing, DuckDuckGo and others.

## 6. Things to know before launch

1. **Gated data is publicly readable.** The public API (`GET /api/startups/<slug>` and the list) returns email, phone, registration number, valuation, funding, market sizing and more to anyone, and the server-rendered profile page includes all of it in its HTML, even though the screen shows locks ("Unlock…") to visitors who are not signed in. Search engines can read it too. The SEO titles, descriptions, sitemap and structured data use none of it, but indexing profile pages makes that data easier to find. **Recommendation:** remove those fields from the API response for signed-out requests (a backend change, not done here), or deploy with `SEO_INDEX_PROFILES=false` until then.
2. **Backend reachability at build time.** The sitemap, the home page's startup list and the directory lists read the public API when the site is built, then refresh hourly. If the backend is down during a deploy, those sections are briefly empty (the static pages are still listed), then fill in.
3. **Indexed-by-mistake pages.** `/dashboard` (the old redirect target) and the sign-in pages were crawlable without any instruction. They are now `noindex` but deliberately not blocked in `robots.txt`, so Google can see the instruction and drop them.
4. **Two public hosts.** `ruwad-platform.vercel.app` stays reachable (the backend's CORS list and the Google Calendar callback use it), so it is `noindex` rather than redirected.

## 7. Performance and mobile review (no design changes made)

- The home page and profile pages are server-rendered text, so they no longer depend on JavaScript for their content. Directory pages' interactive lists still load in the browser.
- **Fonts:** five Google font families with many weights load from a render-blocking stylesheet in `<head>`. Moving them to self-hosted `next/font` (same fonts) is the largest low-risk speed-up. Not done, to avoid any visual change.
- **Hero image:** `saudi-global-network.jpg` is 403 KB and is the first large image on the home and dashboard pages. WebP at similar quality is about 230 KB. Not done (it is referenced from two stylesheets).
- **Logos** are plain `<img>` tags from the upload host without width/height or lazy loading; adding them avoids layout shift.
- **Mobile:** the viewport tag is present and the layouts were standardised for phones earlier. The home page was written to the same grid.
- **Core Web Vitals** were not measured with a lab tool (no browser-based auditing tool is installed in this project). Use PageSpeed Insights (<https://pagespeed.web.dev/>) on `https://www.ruwad.studio/` after deployment, and the Core Web Vitals report in Search Console once there is field data.

## 8. Checking it yourself

```
curl https://www.ruwad.studio/robots.txt
curl https://www.ruwad.studio/sitemap.xml
curl -sI https://ruwad-platform.vercel.app/startups     # X-Robots-Tag: noindex
```

Then Google's Rich Results Test (<https://search.google.com/test/rich-results>) on a profile page, and the Schema Markup Validator (<https://validator.schema.org/>) on the home page.
