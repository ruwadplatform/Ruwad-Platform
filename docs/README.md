# Documentation

| Document | Read it when you need to |
|---|---|
| [architecture.md](./architecture.md) | understand how the services fit together and where a request or a score goes |
| [deployment.md](./deployment.md) | deploy to Render + Supabase, set environment variables, roll back |
| [ml-data-methodology.md](./ml-data-methodology.md) | know how labels, observation windows and training datasets are built |
| [ml-training-methodology.md](./ml-training-methodology.md) | train or evaluate a model, and see which rules keep ML away from the public score |
| [ml-readiness-v2.md](./ml-readiness-v2.md) | read the readiness gate that decides whether a target may be trained |
| [ml-experimental-inference.md](./ml-experimental-inference.md) | run, monitor or roll back the experimental prediction shown next to the score |

Setup and everyday commands are in the [root README](../README.md). Each app has its own notes: [`backend/src`](../backend/src/README.md), [`frontend/src`](../frontend/src/README.md), [`ml`](../ml/README.md), [`backend/scripts`](../backend/scripts/README.md).

Source comments refer to the ML documents by path (`docs/ml-*.md`), so keep those files where they are.
