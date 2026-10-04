# ML Readiness V2 — methodology (Phase 3A)

Readiness V2 changes **what is counted**, not the bar. The thresholds are unchanged: **200** usable examples, **40** positive, **40** negative, **60%** core-feature coverage (`ML_READINESS_THRESHOLDS`). V1 is kept only for before/after comparison (`GET /ml-data/readiness-v1/:target`); the training gate reads V2 (`GET /ml-data/readiness/:target`, `readinessVersion: 2`) and refuses any report that is not V2.

## 1. Missing, zero, unknown, not applicable

| Situation | Representation | Counts as covered? | In the denominator? |
|---|---|---|---|
| Value present (including `0`) | the feature key holds the value | yes | yes |
| Value absent, nobody has said whether it applies | `UNKNOWN` (the default) | no | yes |
| Value absent, declared applicable | `APPLICABLE_MISSING` | no | yes |
| Value absent, explicitly declared not applicable with a reason | `NOT_APPLICABLE` | n/a | **no** (only for that snapshot) |

`NOT_APPLICABLE` is never inferred from a missing value. It exists only as a row in `startup_feature_applicability` with a reason (≥15 characters), an effective date and provenance. It is dated: a declaration effective after a snapshot does not apply to it. Two equally-ranked, disagreeing declarations resolve to `UNKNOWN`. A value that is present always wins. Provenance reuses `ScoreDataSource` and `SOURCE_RANK` (verified document > admin entered > founder submitted > pitch deck > external > system). A founder's declaration is staged as `FOUNDER_SUBMITTED` and only becomes a row (as `ADMIN_ENTERED`, or `VERIFIED_DOCUMENT` when the document was checked) after an admin approves it.

Coverage is pooled: Σ covered ÷ Σ applicable cells. With no `NOT_APPLICABLE` cells it equals the V1 figure exactly. A target whose baseline feature a startup declared `NOT_APPLICABLE` is `EXCLUDED` for that startup (not a negative).

## 2. Training eligibility

`startup_ml_feature_snapshots.trainingEligibility`: `ELIGIBLE`, `ANALYSIS_ONLY`, `EXCLUDED`. Derived from `selectionMethod`: `FIXED_CALENDAR_GRID` and `OTHER_PREDECLARED` → `ELIGIBLE`; `LEGACY_OUTCOME_AWARE` and undeclared → `ANALYSIS_ONLY`. The stored flag cannot override this (an outcome-aware or undeclared snapshot is `ANALYSIS_ONLY` whatever the column says), and an admin cannot make one `ELIGIBLE`. The default export, class balance and readiness include `ELIGIBLE` snapshots only. `includeAnalysisOnly=true` / `includeExcluded=true` are explicit audit options; every row carries `snapshotSelectionMethod` and `trainingEligibility`. The Python loader additionally drops any non-`ELIGIBLE` row and refuses an export without the column.

## 3. Per-family outcome coverage

`startup_outcome_coverage`: "sources about this outcome family were checked through this date". Families: `FUNDING, REVENUE, CUSTOMER, REGULATORY, COMMERCIALIZATION, PARTNERSHIP, MARKET_ENTRY, SURVIVAL`. Each target declares one family (`TargetDefinition.coverageType`).

A **negative** needs all three: the window has matured, **coverage of that family** is attested through `snapshotDate + window`, and no qualifying event is on file. Otherwise the label is `COVERAGE_UNATTESTED` ("unknown"), never a negative. A **positive** is recognised from a recorded event without any attestation. Growth and sum targets need coverage through the window. Survival: only a **verified** dated shutdown makes a negative; an unverified (status-only) shutdown gives `UNVERIFIED`; "still active" needs `SURVIVAL` coverage. Attestations cannot be set in the future, are append-only (revoked, not deleted), and never cross families.

`LabelContext` is a required argument of `TargetDefinition.calculate`: legacy (unchecked) or coverage-enforced. Training, export and readiness always use coverage-enforced.

## 4. First-party historical data

Founders (owner or admin only; `Cache-Control: private, no-store`) can add dated entries: revenue (by period; recognized/ARR/MRR/GMV/other; GMV and MRR are never revenue, ARR maps to `recurringRevenue`), customer metrics (customers, patients, users, clinics, hospitals, enterprise clients, tests — each metric type is its own series), team size, founder career start years (experience is *derived* as of each snapshot, strongest founder), regulatory pathway (yes/no/unsure; "no" needs a reason), regulatory milestones (exact values from the company's own ladder only), funding rounds (full date; duplicate detection against events and profile rounds), and completeness attestations. Non-SAR amounts must bring their own SAR equivalent and rate source; nothing is converted automatically.

Entries live in `startup_historical_submissions` until reviewed (`PENDING_REVIEW → VERIFIED | REJECTED | CHANGES_REQUESTED`). They cannot affect any snapshot or label before approval. Approval writes to the existing evidence / outcome-event / applicability / career / coverage tables with the reviewer's provenance; conflicting evidence is kept (both rows `CONFLICT`). A founder cannot set `source`, `verified` or any review field (the request validator rejects unknown properties). Saving evidence never builds a snapshot.

Supporting documents are referenced through the existing Data Room document list (`entity_documents`); the platform deliberately stores no files, so the reviewer opens the document through the existing Data Room process.

## 5. Snapshot building

`HistoricalSnapshotBuilder` uses evidence with `effectiveDate <= snapshotDate`. It derives `founderExperienceYears`/`healthcareExperienceYears` from career anchors, and `fundingRounds`/`totalFundingRaised` from funding events **only if funding coverage is attested through the snapshot date**. Provenance per feature comes from the winning evidence row.

## 6. Privacy

Historical financial/customer data is internal: owner-or-admin routes, admin review/dashboard routes, no field in any public startup payload. Founder names and role history are never exported.
