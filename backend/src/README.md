# backend/src

One folder per feature. Each has a `*.module.ts` (wiring), `*.controller.ts` (HTTP), `*.service.ts` (logic), `*.entity.ts` (tables) and a `dto/` folder for request validation. Tests sit next to the code as `*.spec.ts`.

## People and access
| Folder | Contains |
|---|---|
| `auth` | Login, signup, password reset, JWT cookies |
| `users` | User accounts and profiles |
| `organizations` | Who owns which listing (memberships) and listing claims |

## Directory listings
| Folder | Contains |
|---|---|
| `startups`, `investors`, `hubs`, `multinationals`, `research` | One folder per listing type: public API, search and profile data |
| `directory-shared` | Tables used by several listing types: contacts, products, sectors, partnerships, document references |
| `investments` | Links between investors and the startups they funded |
| `introductions` | Introduction requests between users |
| `data-room` | NDA-gated access to a company's documents |
| `watchlists`, `saved-searches` | A user's saved items and searches |

## Submissions and publishing
| Folder | Contains |
|---|---|
| `submissions` | The submission workflow: draft, submit, admin review, approve. `publishers/` turns an approved payload into a listing. |
| `resume-parse`, `uploads` | Résumé autofill and file uploads |

## Scoring and ML
| Folder | Contains |
|---|---|
| `scoring` | The RUWĀD Score: `engines/` for the six factors, the assessment service, the existing-startup backfill |
| `ml-data` | Datasets for ML: feature snapshots, outcome events, labels, readiness, experimental inference, historical data import (`historical/`, `labels/`) |

## Content and reporting
| Folder | Contains |
|---|---|
| `news`, `events`, `content` | News and events, plus the jobs that refresh them |
| `reports` | The report library and report submissions |
| `analytics`, `activity` | Dashboards and the activity feed |
| `calendar` | Google Calendar connection |
| `email` | Outgoing email |

## Shared plumbing
| Folder | Contains |
|---|---|
| `common` | Enums, base entity, guards, decorators, shared helpers |
| `database` | TypeORM data source and `migrations/` |
| `health` | Health check endpoint |
| `app.module.ts`, `main.ts` | Application root and start-up |

Database changes always go through a new file in `database/migrations/`; never edit one that has already run.
