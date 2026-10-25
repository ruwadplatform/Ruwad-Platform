import { DEMO_ADVISORS } from "@/features/advisory/demo-advisors";
import type { AdvisorSummary } from "@/features/advisory/advisory-types";

/** Advisory Services data access — the one place the screens get advisors from.
 *
 * PHASE 1: there is no advisory backend yet, so this serves the fictional demonstration seed (`DEMO_ADVISORS`). The functions are async and
 * return the final `AdvisorSummary` shape so that, once the backend exists, only these two bodies change (to `api.get("/advisory/advisors")`
 * and `api.get("/advisory/advisors/:id")`) — the directory and profile screens stay as they are. */

export async function fetchAdvisors(): Promise<AdvisorSummary[]> {
  return DEMO_ADVISORS;
}

export async function fetchAdvisor(id: string): Promise<AdvisorSummary | null> {
  return DEMO_ADVISORS.find((a) => a.id === id) ?? null;
}
