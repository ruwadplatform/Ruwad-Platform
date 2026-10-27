# Public API access policy (field-level)

Status: **implemented and tested locally; not deployed.** Applies to the five ecosystem directories (startups, investors, hubs, research institutions, multinationals), reports and analytics.

## Why

Until now the public API returned the full record to anyone, and the screens only *hid* restricted fields behind "Sign in to unlock". Anyone calling `GET /api/startups/<slug>` (or reading the server-rendered page source) received emails, phone numbers, registration numbers, funding, valuation, market sizing, funding rounds and more. The screens' locks were presentation only. The rules below are now enforced **on the server**, per field, before the response leaves the backend.

## Who is asking

Resolved from the signed session cookie only (never from anything the client says), by `OptionalJwtAuthGuard` (`backend/src/visibility/`). A missing, malformed, tampered or expired session is a visitor, not an error.

| Level | Who | Notes |
|---|---|---|
| **public** | Visitors, crawlers, scripts, invalid sessions | |
| **member** | Any signed-in, non-administrator account | What the screens unlock behind "Sign in" today. Not everything: see the tables. |
| **owner** | The member who is an `OWNER` (entity_memberships) of **this** record | Per record. Owning another startup grants nothing here. Adds the registration number. |
| **admin** | `RUWAD_ADMIN`, `SUPER_ADMIN` | Whole record, except internal flags (`foundedBasis`, `scoringBasis`) and report pipeline fields, which no one receives. |

## What each level receives

Responses are built from **allow-lists** (`backend/src/visibility/field-policy.ts`): a field that is not listed is not sent, so a column added to an entity later stays private until someone decides it is public. The same policy builds list and detail responses.

### Startups
| | Fields |
|---|---|
| public | id, slug, name, logo, category, subsector, tagline, description, problem/solution/advantage, city, country, headquarters, founded, stage, status, business model, employees, legal/former name, website, company LinkedIn, verified tier, **overall RUWĀD Score and score status**, SFDA status badge, news, sectors, products, team (name, title, founder flag, personal LinkedIn), provenance, `investorCount`, contact `website` + `linkedin` |
| member adds | funding total, valuation, fundraising flag and target, funding rounds, FDA/CE/clinical/patent status, market sizing and competitors, traction, email, phone, linked investors, contact person/email/phone, score confidence/version and the **factor breakdown** |
| owner / admin add | **registration number** (never public: nothing marks a number as verified and meant for publication) |
| nobody | `foundedBasis`, `scoringBasis`, team members' internal scoring inputs (`experienceYears` …), timestamps, any unlisted column |

### Investors
public: profile, thesis, ticket, AUM, counts, news, open opportunities, **a three-company portfolio preview plus the total** (`portfolioSize`; each preview item is name, sector, city, stage, score only). member adds: the full portfolio with investment round and year, and recent deals. No one receives a portfolio company's funding total through an investor.

### Hubs, research institutions, multinationals
public: everything shown on the profile **except** contact people, emails and phone numbers. member adds: the contact block (hubs: contact; research: `contacts` offices/emails/phones; multinationals: email, phone, investments list).

### Reports
- **Pipeline fields are removed from every public response, administrators included:** `researchQueries`, `submissionId`, `scope`, `generationMode`, `reportKind`; the search counters inside `generated.research`; each source's search `query`, `topic` and `tier`. Administrators read the full report through `/reports/admin/*`, unchanged.
- **Hand-written reports:** a visitor receives the first two findings, the first chart and section headings; the analysis text, remaining charts and executive summary are for members (`lockedFindingCount` tells the screen how many were left out).
- **Generated and library reports:** public content. For a visitor, per-company funding amounts, the "funding by company" distribution and funding targets are removed, company lists are in name order (a funding-ranked list would reveal the ranking), and a one-company analysis report keeps only its public facts.
- Drafts are never served by the public route, to anyone.

### Analytics
Visitors receive counts, scores and ecosystem-wide totals (`trackedFundingSar`, deal count, average deal size). They do **not** receive per-company or per-round amounts, a "most funded" ranking, or the funding-by-stage / funding-by-sector charts.

## Not inferable by sorting or filtering
`sort=fundingTotal` is honoured only for members; a visitor asking for it gets the default order. The query DTOs have no filter on a restricted field.

## Server-rendered pages and caching
- Profile and report pages pass **only the `ruwad_token` cookie** (shape-checked as a JWT) to the backend (`frontend/src/lib/api/server-session.ts`). That makes the page dynamic; the response is `Cache-Control: private, no-store`. A request carrying the cookie is never cached.
- `generateMetadata`, JSON-LD, the sitemap and the plain list on directory pages always use the **public** view, so they can never contain member data.
- Every personalised API response carries `Cache-Control: private, no-store` and `Vary: Cookie, Authorization`.
- Client data caches are reset, and server-rendered pages refreshed, when someone signs in, registers or signs out.

## Search engines
- `SEO_INDEX_PROFILES` is now **opt-in**: profile pages are `noindex`, absent from the sitemap and from the directories' plain lists unless it is set to `true` at build time. Set it only after the redaction has been verified in production.
- Report detail pages are `noindex`. The homepage (`/dashboard`) and the public directories stay indexable.
- `/` redirects to `/dashboard` with a **temporary 307** for the first deployment; switch `permanent: true` in `next.config.ts` only after production verification.

## Decisions this policy makes (please confirm or change)
1. **Ecosystem-wide funding totals stay public** (the homepage "Tracked Funding"), because they are aggregates; per-company and per-round figures are not.
2. **The SFDA status badge on each company card stays public** (the existing UI shows it to everyone); FDA/CE/clinical/patent detail is for members.
3. **Team members' names, titles and personal LinkedIn links stay public** (the Team tab was never locked).
4. **A signed-in member** sees what the screens already unlock for any signed-in account; no finer role distinction exists in the product today.
5. **Registration numbers are owner/admin only** until a "verified and published" flag exists.

## Tests
- Unit: `backend/src/visibility/field-policy.spec.ts` (`npx jest src/visibility`).
- Integration against the local database only: `npm run db:local` then `npm run test:visibility` (visitor, invalid session, member, owner, owner of another record, admin; all five directories, reports, analytics, sorting, headers).
- Frontend: `npm run test:unit` (session cookie forwarding, profile-indexing default).

## Deployment and rollback
See the deployment plan delivered with this change. In short: deploy the **frontend first** (it works against both the old and the new API), then the **backend** (the old frontend would show members empty fields against the redacting API); keep `SEO_INDEX_PROFILES` unset; verify with the checklist; only then consider `SEO_INDEX_PROFILES=true` and the permanent redirect. Rollback is a redeploy of the previous commit on each side; no database change is involved.
