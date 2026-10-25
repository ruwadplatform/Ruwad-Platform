import { DEMO_ADVISORS, DEMO_ADVISOR_PROFILES } from "@/features/advisory/demo-advisors";
import type { AdvisorProfile, AdvisorSummary } from "@/features/advisory/advisory-types";

/** Advisory Services data access — the one place the screens get advisors from.
 *
 * PHASE 1–2: there is no advisory backend yet, so this serves the fictional demonstration seed (`DEMO_ADVISORS` / `DEMO_ADVISOR_PROFILES`). The
 * functions are async and return the final shapes so that, once the backend exists, only these bodies change (to `api.get("/advisory/advisors")`
 * and `api.get("/advisory/advisors/:id")`) — the directory and profile screens stay as they are. */

export async function fetchAdvisors(): Promise<AdvisorSummary[]> {
  return DEMO_ADVISORS;
}

export async function fetchAdvisor(id: string): Promise<AdvisorProfile | null> {
  return DEMO_ADVISOR_PROFILES.find((a) => a.id === id) ?? null;
}
