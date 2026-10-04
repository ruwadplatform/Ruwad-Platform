import { createHash } from "crypto";
import { ML_FEATURES_V1 } from "./ml-data.constants";
import type { ScoringFeatures } from "../scoring/scoring.types";

/** Pure helpers for LIVE EXPERIMENTAL inference — no I/O. */

export interface InferenceInput {
  /** Allow-listed, numeric/boolean only. Nothing else can be expressed here: no names, contacts, documents, free text, RUWĀD score or factor scores. */
  features: Record<string, number | boolean>;
  /** Keys that were present but unusable (non-finite, negative, wrong type); they are dropped, never sent. */
  dropped: string[];
}

/** Builds the CURRENT-state model input.
 *  - Base: system-derived features (founder count, funding rounds, investor count, ...).
 *  - Overlay: stored scoring features (founder/admin/pitch-deck values win over derived ones).
 *  - teamSize deliberately does NOT come from the derived "number of listed team members": the model was trained on headcount, so a
 *    founder-only team list (e.g. 2 people) would be read as a 2-person company. Use a stored teamSize, else the profile's
 *    `employees` headcount when it is positive, else leave it missing.
 *  - Only ML_FEATURES_V1 keys; only finite, non-negative numbers and booleans. */
export function assembleInput(parts: { stored?: Partial<ScoringFeatures> | null; storedProvenance?: Record<string, { source?: string } | undefined> | null; derived?: Partial<ScoringFeatures> | null; employees?: number | null }): InferenceInput {
  const merged: Record<string, unknown> = { ...(parts.derived ?? {}) };
  delete merged.teamSize;
  const stored: Record<string, unknown> = { ...(parts.stored ?? {}) };
  // A stored teamSize that the platform itself derived (count of listed team members) is the same skew: only a value a person reported
  // (founder/admin/pitch deck) is a headcount.
  if (parts.storedProvenance?.teamSize?.source === "SYSTEM_DERIVED") delete stored.teamSize;
  Object.assign(merged, stored);
  if ((merged.teamSize === undefined || merged.teamSize === null) && typeof parts.employees === "number" && parts.employees > 0) merged.teamSize = parts.employees;

  const features: Record<string, number | boolean> = {};
  const dropped: string[] = [];
  const allowed = new Set<string>(ML_FEATURES_V1 as string[]);
  for (const [key, value] of Object.entries(merged)) {
    if (!allowed.has(key) || value === undefined || value === null) continue;
    if (typeof value === "boolean") features[key] = value;
    else if (typeof value === "number" && Number.isFinite(value) && value >= 0) features[key] = value;
    else if (typeof value === "number" || typeof value !== "string") dropped.push(key);
    // strings (e.g. regulatoryMilestone) are never sent: the experimental model has no free-text/categorical input
  }
  return { features, dropped };
}

/** Same input -> same hash, regardless of key order. This is the de-duplication key. */
export function inputHash(startupId: string, modelVersion: string, schemaVersion: string, features: Record<string, number | boolean>): string {
  const canonical = JSON.stringify(Object.keys(features).sort().map((k) => [k, features[k]]));
  return createHash("sha256").update(`${startupId}|${modelVersion}|${schemaVersion}|${canonical}`).digest("hex");
}

export const DISTRIBUTION_BUCKETS = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%"] as const;

/** 1.0 falls in the last bucket. */
export function bucketFor(probability: number): (typeof DISTRIBUTION_BUCKETS)[number] {
  const i = Math.min(4, Math.max(0, Math.floor(probability * 5)));
  return DISTRIBUTION_BUCKETS[i];
}

export function emptyDistribution(): Record<string, number> {
  return Object.fromEntries(DISTRIBUTION_BUCKETS.map((b) => [b, 0]));
}

export const RELIABILITY_LEVELS = ["VERY_LOW", "LOW"] as const;
