import type { Startup } from "./startup.entity";
import type { UpdateStartupDto } from "./dto/update-startup.dto";

/** Columns that can change a RUWĀD Score or an ML input vector: the six engines read category, funding, market size and regulatory
 * status directly; headcount feeds the experimental model; clinical/patent status are the regulatory and technology/IP facts founders
 * edit. Name, tagline, description, logo, website, social links and contact details are deliberately absent: editing them is cosmetic and
 * must not start a new assessment. */
const SCORING_COLUMNS = ["category", "employees", "fundingTotal", "valuation", "fundraising", "targetRaise", "sfda", "fda", "ce", "clinicalStatus", "patentStatus", "marketTam", "marketSam", "marketSom", "marketCompetitors"] as const;

/** Relations a founder edits whose rows feed system-derived features (team size/founders/experience, funding rounds). They cannot be
 * diffed cheaply here, so supplying them counts as relevant; an unchanged resubmission is then absorbed downstream (score history is
 * not duplicated for an identical result, and no ML snapshot/prediction is created without a material feature change). */
const SCORING_RELATIONS = ["team", "rounds"] as const;

const same = (a: unknown, b: unknown): boolean => {
  if (a == null && b == null) return true;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return a === b;
};

/** True when `dto` would change something that can alter the score or the ML inputs. Pure: call it BEFORE applying the update. */
export function affectsScoring(before: Startup, dto: UpdateStartupDto): boolean {
  const patch = dto as Record<string, unknown>;
  const current = before as unknown as Record<string, unknown>;
  for (const key of SCORING_COLUMNS) {
    if (patch[key] !== undefined && !same(current[key], patch[key])) return true;
  }
  return SCORING_RELATIONS.some((key) => patch[key] !== undefined);
}
