import type { Startup } from "../../startups/startup.entity";
import type { FactorResult, ScoringFeatureKey, ScoringFeatures } from "../scoring.types";
import { normalizeRegulatoryStage } from "../scoring.utils";

/** Regulatory Readiness is the one factor that must NOT use the same ladder
 * for every company — a digital health SaMD product, a physical medical
 * device and a therapeutic follow completely different regulatory paths,
 * and scoring one against another's milestones would misrepresent both. */
export type Pathway = "DIGITAL_HEALTH" | "MEDICAL_DEVICE" | "THERAPEUTIC";

const DIGITAL_HEALTH_CATEGORIES = ["Digital Health", "Telemedicine", "Healthcare IT", "AI Healthcare", "Health Data"];
const MEDICAL_DEVICE_CATEGORIES = ["MedTech", "Medical Devices", "Diagnostics"];
const THERAPEUTIC_CATEGORIES = ["Biotechnology", "Genomics", "Precision Medicine", "Therapeutics", "Pharmaceuticals", "CRO", "CDMO"];

/** Milestone ladders, in order, for display/explanation only — the actual
 * position on the ladder comes from `regulatoryMilestone` when an admin or
 * pitch-deck extraction has set one explicitly (full fidelity), or is
 * otherwise approximated from the startup's own sfda/fda/ce/clinicalStatus
 * columns (see below) — real signal from data already on the platform,
 * without pretending to know a milestone nobody has reported. */
export const LADDERS: Record<Pathway, string[]> = {
  DIGITAL_HEALTH: ["applicability assessed", "classification identified", "strategy prepared", "QMS readiness", "clinical validation", "submission preparation", "SFDA submission", "SFDA authorization", "FDA/CE/other approval"],
  MEDICAL_DEVICE: ["device classification", "ISO 13485", "QMS", "technical documentation", "clinical evidence", "SFDA pathway", "MDMA", "FDA 510(k)/De Novo", "CE MDR", "approval", "commercialization"],
  THERAPEUTIC: ["discovery", "preclinical", "IND/CTA preparation", "Phase I", "Phase II", "Phase III", "regulatory submission", "approval", "commercial stage"],
};

/** Exported for ml-data/labels/regulatory-progression.ts — the label
 * calculator needs the identical pathway/ladder logic the score uses (per
 * the explicit "reuse scoring logic, keep label logic independent" rule),
 * not a re-implementation that could silently drift from this one. */
export function pathwayFor(category: string): Pathway {
  if (MEDICAL_DEVICE_CATEGORIES.includes(category)) return "MEDICAL_DEVICE";
  if (THERAPEUTIC_CATEGORIES.includes(category)) return "THERAPEUTIC";
  if (DIGITAL_HEALTH_CATEGORIES.includes(category)) return "DIGITAL_HEALTH";
  return "DIGITAL_HEALTH"; // default for uncategorized healthcare-software-shaped companies
}

/** Coarse 0-4 stage read from a single free-text status string (SFDA/FDA/CE
 * columns already collected for every startup) — deliberately coarse,
 * keyword-based, and conservative: an unrecognized string is "no signal",
 * never guessed toward a middle value. */
function coarseStageFromStatus(status: string | null | undefined): number | null {
  if (!status) return null;
  const s = status.toLowerCase().trim();
  if (!s || s === "n/a" || s === "not applicable" || s === "not disclosed" || s === "unknown") return null;
  if (/\b(not submitted|none|no)\b/.test(s)) return 0;
  if (/\b(planned|planning|assessing|assessed|in progress)\b/.test(s)) return 1;
  if (/\b(preparing|preparation|in preparation)\b/.test(s)) return 2;
  if (/\b(submitted|pending|under review|in review)\b/.test(s)) return 3;
  if (/\b(approved|authorized|authorised|registered|cleared|granted)\b/.test(s)) return 4;
  return null;
}

export function scoreRegulatory(f: ScoringFeatures, startup: Startup): FactorResult {
  const used: ScoringFeatureKey[] = [];
  const missing: ScoringFeatureKey[] = [];
  const pathway = pathwayFor(startup.category);
  const ladder = LADDERS[pathway];

  let stageIndex: number | null = null;
  let source: "explicit" | "inferred" | null = null;

  const explicit = ladder.findIndex((stage) => stage.toLowerCase() === (f.regulatoryMilestone ?? "").toLowerCase());
  if (explicit >= 0) {
    stageIndex = explicit;
    source = "explicit";
  } else {
    const coarse = [coarseStageFromStatus(startup.sfda), coarseStageFromStatus(startup.fda), coarseStageFromStatus(startup.ce)]
      .filter((v): v is number => v != null);
    if (coarse.length) {
      const best = Math.max(...coarse);
      stageIndex = Math.round((best / 4) * (ladder.length - 1));
      source = "inferred";
    }
  }

  if (f.regulatoryMilestone != null) used.push("regulatoryMilestone"); else missing.push("regulatoryMilestone");
  // sfda/fda/ce/clinicalStatus aren't ScoringFeatures keys (they're existing
  // Startup columns), so they're reflected in the reason text, not these lists.

  const score = stageIndex == null ? null : normalizeRegulatoryStage(stageIndex, ladder.length);
  const confidence = source === "explicit" ? 0.9 : source === "inferred" ? 0.5 : 0;

  const pathwayLabel = pathway === "MEDICAL_DEVICE" ? "medical device" : pathway === "THERAPEUTIC" ? "therapeutic" : "digital health";
  const reason =
    score == null
      ? `No SFDA/FDA/CE status has been reported for this ${pathwayLabel} company yet.`
      : source === "explicit"
        ? `Regulatory milestone reported: ${ladder[stageIndex!]} (${pathwayLabel} pathway).`
        : `Estimated from reported SFDA/FDA/CE status, approximately at the "${ladder[stageIndex!]}" stage of the ${pathwayLabel} pathway.`;

  return { score, confidence, reason, inputsUsed: used, missingInputs: missing };
}
