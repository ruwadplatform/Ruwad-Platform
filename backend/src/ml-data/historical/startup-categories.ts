/** Mirrors frontend/src/data/reference.ts HC_CATEGORIES — the only categories
 * a startup may carry. Kept here so admin maintenance paths can validate
 * against it without importing from the frontend. */
export const STARTUP_CATEGORIES = [
  "Biotechnology", "MedTech", "Digital Health", "Diagnostics", "AI Healthcare",
  "Pharmaceuticals", "Medical Devices", "Genomics", "Precision Medicine",
  "Telemedicine", "Therapeutics", "Health Data", "Preventive Health",
  "Healthcare Services", "Healthcare IT", "CRO", "CDMO", "Manufacturing", "Other",
] as const;
