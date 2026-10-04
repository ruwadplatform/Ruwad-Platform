# RUWĀD ML Data Methodology

Phase 1C built the data pipeline a future startup-outcome-prediction model will train on. **No model has been trained.** This document is the permanent reference for how the pipeline works, so a future training pass can trust what it's reading.

The one rule everything below protects: the model must learn

```
startup state at time T  →  outcome after time T
```

never

```
startup state today  →  today's rule-based RUWĀD Score
```

The deterministic RUWĀD Score (`backend/src/scoring/`) is a separate system. It is never the supervised target, and by default it is never even a feature — see [Exclusions](#exclusions).

## Feature snapshots

A row in `startup_ml_feature_snapshots` is a frozen record of exactly what RUWĀD knew about one startup at one moment — the full `ScoringFeatures` object (`backend/src/scoring/scoring.types.ts`) as it stood in `startup_scoring_features` at that instant, plus its provenance map, plus the startup's `category`/`stage` and the deterministic score's `confidenceScore`/`status` at that moment (metadata only — never fed to a model as a feature).

**Immutability**: once written, a snapshot row is never updated. A later change to the startup's live features creates a *new* snapshot; it never mutates an old one. This is what makes the dataset exporter structurally leakage-safe rather than leakage-safe by convention — every read is scoped to one frozen `features` jsonb blob, never "the startup's current row."

**When a snapshot is created** (`backend/src/ml-data/ml-snapshot.service.ts`, called from `ScoringService.recalculateStartupScore()` — the one place every write path funnels through): the first time a startup has any scoring features at all, or whenever a `ScoringFeatures` value changes, or whenever a feature's `verified` flag changes. A cosmetic edit (logo, description wording) never touches `ScoringFeatures`, so it never reaches this check — no separate "is this field material" list to maintain. An admin can also force one via `POST /ml-data/startups/:id/snapshot`, bypassing the materiality check.

**`featureSchemaVersion`** (`ML-FEATURES-1.0`, `backend/src/ml-data/ml-data.constants.ts`) versions the *shape* of the captured `features` object — bump it if a `ScoringFeatures` key is ever renamed or removed, so an old snapshot's meaning stays traceable. It is independent of `SCORE_VERSION` (the scoring methodology) and of `ML_FEATURES_V1` (the export-time allowlist — see below).

## Outcome events

A row in `startup_outcome_events` is a real, dated thing that happened to a startup — `eventType` (`FUNDING_ROUND`, `REVENUE_UPDATE`, `CUSTOMER_COUNT_UPDATE`, `ACTIVE_USERS_UPDATE`, `REGULATORY_MILESTONE`, `REGULATORY_APPROVAL`, `COMMERCIAL_LAUNCH`, `PARTNERSHIP_SIGNED`, `MARKET_ENTRY`, `TEAM_SIZE_UPDATE`, `SHUTDOWN`, `ACQUISITION`, `IPO`, `OTHER`), `eventDate` (when it happened, not when it was entered), a numeric and/or text value, and provenance (`source` ∈ `FOUNDER_REPORTED | ADMIN_ENTERED | VERIFIED_DOCUMENT | PUBLIC_SOURCE | SYSTEM_DERIVED`, plus a separate `verified` boolean — entering a claim never implies verifying it).

Append-only, same shape as every other audit trail in this codebase (`submission_review_events`, `startup_score_history`).

**Automatic derivation** (deliberately limited to two clean, single-hook cases):
- A `FUNDING_ROUND` event is derived from every funding round a founder reports at submission-publish time (`SubmissionsService.approve()`), tagged `SYSTEM_DERIVED`.
- A `REGULATORY_MILESTONE` event is derived whenever a non-admin write changes `regulatoryMilestone`'s value (`ScoringService.writeFeatures()`), tagged `SYSTEM_DERIVED`. Admin-entered milestone changes (via `setFeatures`) do *not* auto-derive an event — an admin editing a value directly already has the dedicated outcome-entry UI if they also want to log it.

Both paths are idempotent (`OutcomeEventsService.createSystemEventIfNew` — same startupId + eventType + eventDate + value is skipped, not duplicated). Partnership auto-derivation was deliberately **not** built: partnerships are replace-on-write (delete-then-insert), so detecting "a new one was added" needs a diff against the previous list — out of scope for this pass, log partnerships through the admin outcome-entry UI instead.

## Label definitions

Computed **dynamically**, never materialized into a table — see [Design decision: why dynamic](#why-labels-are-computed-dynamically-not-materialized) below. Every label calculator lives in `backend/src/ml-data/labels/` as a pure function `(snapshot, events, now) => LabelResult`, mirroring the existing `FactorEngine` pattern the deterministic scoring engines already use.

### Label status

Every label carries an explicit `LabelStatus`, never a bare boolean:

- **`NOT_MATURED`** — the observation window hasn't elapsed yet, and no positive evidence exists yet either. Never collapsed into `false`.
- **`AVAILABLE`** — a real value is known (`valueBoolean` or `valueNumeric`).
- **`INSUFFICIENT_DATA`** — the window elapsed but there isn't enough information to compute a value (e.g. no baseline revenue, or no future value was ever reported).

### Maturity rule — positive-early, negative-only-after-maturity

For a boolean "did X happen within N months" target, a **positive** verdict is confirmed the instant a qualifying event is found — you don't need to wait for the window to close to know something already happened. A **negative** verdict is confirmed *only* once the full window has elapsed with no qualifying event. This is implemented once in `windowedEventBooleanLabel` / `regulatoryProgressionLabel` / `survivalLabel` (`backend/src/ml-data/labels/calculators.ts`) and reused by every boolean target.

Numeric growth targets (`windowedGrowthLabel`, `windowedSumLabel`) are gated on **full maturity before even looking for a value** — a partial early reading isn't a reliable "growth over N months" figure the way an early positive event is a reliable "did X happen" signal.

### Target registry (`backend/src/ml-data/labels/target-registry.ts`)

Every target has a permanent `targetVersion` string (e.g. `FUNDING-12M-v1`) — if a formula or window ever changes, bump the version rather than silently redefining an existing one, so an old export's column header always means what it said it meant.

| Target | Formula | Window(s) |
|---|---|---|
| `raisedNewRoundWithin{6,12,24}Months` | Any `FUNDING_ROUND` event with `snapshotAt < eventDate ≤ snapshotAt + window` | 6/12/24mo |
| `amountRaisedNext12Months` | Sum of `FUNDING_ROUND.valueNumeric` in-window, gated on full maturity | 12mo |
| `revenueGrowth{6,12,24}Months` | `((future − baseline) / baseline) × 100`, baseline = snapshot's `annualRevenue`, future = latest in-window `REVENUE_UPDATE` | 6/12/24mo |
| `revenueGrowthAbove{25,50}Pct12Months` | Boolean wrapper over `revenueGrowth12Months` | 12mo |
| `customerGrowth12Months`, `customerGrowthAbove25Pct12Months` | Same formula, `customerCount` baseline, `CUSTOMER_COUNT_UPDATE` events | 12mo |
| `regulatoryMilestoneAdvancedWithin12Months` | Ladder-stage-index of the best in-window `REGULATORY_MILESTONE`/`REGULATORY_APPROVAL` event > the snapshot's own stage index, using the *same* `pathwayFor`/`LADDERS` the regulatory scoring engine uses (`backend/src/scoring/engines/regulatory.engine.ts`) — never compares across mismatched sector pathways | 12mo |
| `launchedCommerciallyWithin12Months` | Any `COMMERCIAL_LAUNCH` event in-window | 12mo |
| `signedCommercialPartnershipWithin12Months` | Any `PARTNERSHIP_SIGNED` event in-window | 12mo |
| `enteredNewCountryWithin12Months` | Any `MARKET_ENTRY` event in-window | 12mo |
| `expandedOutsideSaudiWithin24Months` | `MARKET_ENTRY` event in-window with `valueText ≠ "Saudi Arabia"` | 24mo |
| `activeAfter{12,24}Months` | `true` unless a `SHUTDOWN` event exists in-window — silence is *never* evidence of failure | 12/24mo |

This is a representative set, not exhaustive — the registry is one array entry per target; adding another (e.g. a 24-month customer-growth variant) is a one-line addition on the existing generic calculators, not new architecture.

## Leakage prevention

Three structural guarantees, not conventions someone has to remember:

1. **The feature vector is always the frozen snapshot.** No code path in the label calculators, the coverage/quality services, or the exporter ever reads a startup's *current* live state — only `startup_ml_feature_snapshots.features`, written once and never mutated.
2. **`eventWithinWindow(eventDate, snapshotAt, windowEnd)`** (`backend/src/ml-data/labels/observation-windows.ts`) is the single check every calculator and the exporter share: an event counts only if `eventDate` falls strictly after `snapshotAt` and at or before `snapshotAt + window`. An event one day past the window is excluded, full stop.
3. **Maturity gates every negative/numeric verdict.** A boolean target's negative branch, and every numeric target's value, is withheld (`NOT_MATURED`) until the observation window has actually elapsed — nothing is ever back-filled from data that didn't exist yet at the point being evaluated.

## Data quality

`MlDataQualityService` (`backend/src/ml-data/ml-data-quality.service.ts`) computes, per `ML_FEATURES_V1` feature: row count, non-null count, missing %, unique count, verified % (fraction of present values whose provenance is `verified`), and for numeric features min/max/mean/median plus an IQR-based outlier count; for categorical features (`regulatoryMilestone` and the boolean-flag keys) a value distribution instead.

It also flags structural issues, never silently correcting them: impossible negative values for count-shaped features, NaN/Infinite values, duplicate snapshots (identical `features` for the same startup), and future-dated outcome events.

`MlCoverageService` reports whether the dataset overall is ready to look at — published-startup counts broken down by 4+/50%+/70%+ scoring coverage, snapshots old enough to have a complete 12-month window, and category/stage/founded-year/country breakdowns.

`MlClassBalanceService` reports positive/negative/not-matured/insufficient-data counts per target — never train on heavily imbalanced or mostly-immature data without seeing this first.

`MlReadinessService` combines both into a go/no-go report per target against configurable operational thresholds (`ML_READINESS_THRESHOLDS` in `ml-data.constants.ts`: `MIN_TRAINING_ROWS=200`, `MIN_POSITIVE_ROWS=40`, `MIN_NEGATIVE_ROWS=40`, `MIN_CORE_FEATURE_COVERAGE=0.6`). These are operational gates, not a claim that a model trained past them will be good.

## Exclusions

**Never in the default export**: `ruwadScore`, per-factor scores, or any other score-derived value. This is automatic, not a filter to remember — the feature snapshot's `features` object is a copy of `ScoringFeatures`, and `ruwadScore`/factor scores were never part of that type to begin with. `dataConfidence` is stored on the snapshot as filter metadata (`minConfidence` export param) but is never emitted as a feature column, so a model can't free-ride on how confident RUWĀD's own deterministic system was.

**PII**: `ML_FEATURES_V1` (`backend/src/ml-data/ml-data.constants.ts`) is an explicit allowlist of `ScoringFeatures` keys — every one of them a company-level structured number/boolean/enum-like string. There is no email, name, phone, note, or document-content key anywhere in `ScoringFeatures` to begin with, so nothing needs filtering out at export time beyond staying inside this allowlist.

**Identifiers**: `startupId`/`snapshotId` are included by default (for audit — "why is this row in the dataset" is always answerable by tracing back to the snapshot and the events that produced its label) but can be stripped via `includeIdentifiers=false` for a pure model-input matrix.

> **Superseded in part by Readiness V2 (Phase 3A): see [ml-readiness-v2.md](ml-readiness-v2.md).** Labels now require attested per-family outcome coverage for negatives, the default export and readiness count training-eligible snapshots only, and coverage is applicability-aware.

## Exports

`GET /ml-data/export?target=…&format=csv|json&minConfidence=…&verifiedOnly=…&includeIdentifiers=…&includeImmature=…` — admin-only. One target, one window (fixed per target name, e.g. `raisedNewRoundWithin12Months` is always a 12-month window), eligible (`AVAILABLE`-status) rows only by default. `verifiedOnly=true` blanks an individual unverified feature value rather than dropping the whole row — "verified features only" is a per-feature guarantee. `includeImmature=true` keeps `NOT_MATURED`/`INSUFFICIENT_DATA` rows for audit purposes, with an explicit `target_<name>_status` column — never silently mixed in as a confirmed negative.

Column shape: `startupId?, snapshotId?, snapshotAt, category, startupStage, featureSchemaVersion, <every ML_FEATURES_V1 key>, target_<name>, target_<name>_status, targetVersion`.

CSV is hand-rolled (no CSV library exists anywhere in this monorepo, matching its zero-unnecessary-dependency convention).

## Train/validation split (preparation only — not implemented as a split utility in this pass)

When training eventually happens: split chronologically by `snapshotAt` (older → train, newer → validation/test), grouped by `startupId` so multiple snapshots from the same startup never appear on both sides of the split. **Never** split by random row — a model that's seen one snapshot of a startup during training has implicitly seen information correlated with that same startup's later snapshot in validation.

## Design decision: why labels are computed dynamically, not materialized

The spec's alternative was a `startup_ml_training_examples` table, pre-computing and storing every label. Rejected: a label's maturity state changes purely with the passage of time — a row that says `NOT_MATURED` today is wrong tomorrow with zero data changes, and this codebase has no scheduled-job infrastructure (only an HTTP-triggered, admin-run "refresh" pattern) to "age" a materialized cache correctly. A stale materialized row reporting `NOT_MATURED` long after it actually matured is a real correctness bug, not a performance nit. Computing on read is cheap at this data scale (one filter + comparison per snapshot × event set) and keeps a single source of truth — the snapshots and events tables — with nothing to invalidate.

## Backfill

`POST /ml-data/snapshot-backfill` (admin-only, never auto-run) creates exactly one `BACKFILLED_CURRENT_STATE` snapshot for every startup that has scoring features but no snapshot yet. It never overwrites an existing snapshot and never fabricates a snapshot dated in the past — a backfilled snapshot's `snapshotAt` is "now," and it can only ever be the *start* of a future observation window, never used to construct a label for a period before it existed.

## What's explicitly out of scope for this pass

- An outcome-event CSV importer (dry-run + validation is a separate chunk of work; manual entry + automatic derivation cover near-term needs).
- Scheduled/periodic snapshots (the spec itself calls this a future enhancement).
- `PARTNERSHIP_SIGNED` automatic derivation (needs a diff against the previous replace-on-write list).
- Every example label the original spec listed (~25) — this pass implements 14 representative targets across all 6 groups on 4 shared generic calculators; adding more is a registry entry, not new architecture.
- Actually training a model. That is Phase 2, and requires the dataset above to first clear `MlReadinessService`'s thresholds for whichever target is chosen.
