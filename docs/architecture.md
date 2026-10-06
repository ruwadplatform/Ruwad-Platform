# Architecture

## Services

```
Browser ──► frontend (Next.js)  ──► backend (NestJS API)  ──► Postgres (Supabase)
                                         │
                                         └──► ml (FastAPI, internal only)
```

| Service | Folder | Hosted as | Role |
|---|---|---|---|
| Frontend | `frontend/` | Render web service `ruwad-frontend` | Pages, forms, admin tools. Talks only to the backend API. |
| Backend | `backend/` | Render web service `ruwad-backend` | REST API, authentication, business rules, scoring. The only service that touches the database. |
| ML | `ml/` | Render web service `ruwad-ml` | Serves the experimental prediction model and trains candidate models offline. Never reads the database. |
| Database | `supabase/` (docs only) | Supabase Postgres | Single database for every environment. Schema changes go through TypeORM migrations. |

`render.yaml` describes all three Render services. Pushing to `master` deploys them.

## Publishing a startup

1. A founder fills in the submission wizard (`frontend/src/features/submissions`). Required fields are defined in `schemas/startup.ts`.
2. The backend stores the draft as a `Submission`. On submit it re-checks the payload (`submissions/startup-submission-requirements.ts` and the DTO) and notifies the admin.
3. An admin reviews it and approves. This is the only manual step.
4. Approval publishes the startup (`submissions/publishers/startup-submission.publisher.ts`) and then runs the assessment automatically.

## Assessment after approval

`ScoringService.assessStartup` runs these steps in order:

1. `applyFounderAndAiFeatures` writes the founder's answers as scoring inputs.
2. `applyDerivedFeatures` adds values computed from the data on file (team size, funding totals, investor count).
3. `recalculateStartupScore` computes the six factors and the RUWĀD Score.
4. `runExperimentalMlInference` asks the ML service for a prediction. It never blocks or changes steps 1–3.

The official score and the ML prediction are separate things. The score is rule-based (`scoring/engines`); the prediction is labelled experimental and shown in its own card.

A startup scored from the data already on file (the original directory entries) uses the existing-data basis: a factor with no data counts as 0. New submissions use the standard rule: at least four factors with data and enough confidence, otherwise the score stays pending.

## Where things live

| Question | Look in |
|---|---|
| How is a factor calculated? | `backend/src/scoring/engines/` |
| Which rule decides "scored" or "pending"? | `backend/src/scoring/scoring.service.ts` |
| What does a founder see about their assessment? | `backend/src/scoring/startup-assessment.service.ts`, `frontend/src/features/workspace/StartupAssessmentSection.tsx` |
| How does the ML service stay isolated? | `docs/ml-training-methodology.md`, `ml/app/api/` |
| Which environment variables exist? | `backend/.env.example`, `render.yaml` |
