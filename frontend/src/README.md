# frontend/src

| Folder | Contains |
|---|---|
| `app` | Next.js routes (App Router). Pages stay thin and render a component from `features`. `(app)` holds every page inside the main layout (directories, profiles, workspace, admin); `login`, `signup`, `forgot-password`, `reset-password` sit outside it. |
| `features` | One folder per product area (`startups`, `investors`, `submissions`, `workspace`, `admin`, `screener`, `reports`, ...). Page components, forms and area-specific helpers live here. |
| `components` | Reusable UI with no product logic: `shell` (header, sidebar), `shared` (cards, modals, tables), `icons`, `intelligence`, `workspace`. |
| `lib` | Non-visual code: `api/` (one file per backend area), the data store and cache, navigation config, formatting and validation helpers. |
| `hooks` | React hooks that wrap `lib` (data loading, analytics, calendar). |
| `data` | Fixed vocabularies and reference lists (categories, countries, stages, regulatory ladders). |
| `types` | Shared TypeScript types for entities. |
| `styles` | Plain CSS, split by area; `variables.css` holds the design tokens. |
| `assets` | Images. |

## Conventions

- A route in `app` imports from `features`. A feature builds on `components`, `lib`, `hooks`, `data` and `types`. Sharing between features is the exception (today only `admin` reuses parts of `submissions` and `workspace`); if two features need the same code, move it to `components` or `lib`.
- Backend calls go through `lib/api`, not `fetch` in components.
- Submission forms are described as data in `features/submissions/schemas/`. To make a field required, set `required: true` there; the same rule must exist in the backend (`backend/src/submissions`).
- Unit tests that need no browser (`*.test.ts`) run with `npm run test:unit`.
