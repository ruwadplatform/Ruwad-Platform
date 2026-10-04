import { OutcomeCoverageType, StartupOutcomeEventType } from "../../common/enums";
import type { StartupMlFeatureSnapshot } from "../startup-ml-feature-snapshot.entity";
import type { StartupOutcomeEvent } from "../outcome-event.entity";
import { LabelResult } from "./label-types";
import { growthAboveThresholdLabel, survivalLabel, windowedEventBooleanLabel, windowedGrowthLabel, windowedSumLabel } from "./calculators";
import { regulatoryProgressionLabel } from "./regulatory-progression";
import { gateFor, LabelContext } from "./outcome-coverage";

export type TargetGroup = "FUNDING" | "REVENUE" | "CUSTOMER" | "REGULATORY" | "COMMERCIALIZATION" | "GEOGRAPHIC" | "SURVIVAL";

/** One entry per supported ML target. `targetVersion` is the permanent,
 * documented identifier for exactly this definition (see
 * docs/ml-data-methodology.md) — if the formula or window ever changes,
 * bump the version string rather than silently redefining an existing one,
 * so an old export's column header always means what it said it meant.
 * `coverageType` is the outcome family whose attested coverage a NEGATIVE
 * label of this target depends on (see labels/outcome-coverage.ts) — the
 * target group is too coarse (COMMERCIALIZATION holds both a launch and a
 * partnership target, which are different families). */
export interface TargetDefinition {
  name: string;
  group: TargetGroup;
  coverageType: OutcomeCoverageType;
  targetVersion: string;
  windowMonths: number;
  valueType: "boolean" | "numeric";
  /** `ctx` is REQUIRED: every caller states whether it wants legacy (unchecked)
   * or coverage-enforced labels — see LabelContext. */
  calculate: (snapshot: StartupMlFeatureSnapshot, events: StartupOutcomeEvent[], now: Date, ctx: LabelContext) => LabelResult;
}

const isFundingRound = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.FUNDING_ROUND;
const isRevenueUpdate = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.REVENUE_UPDATE;
const isCustomerUpdate = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.CUSTOMER_COUNT_UPDATE;
const isCommercialLaunch = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.COMMERCIAL_LAUNCH;
const isPartnershipSigned = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.PARTNERSHIP_SIGNED;
const isMarketEntry = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.MARKET_ENTRY;
const isMarketEntryOutsideSaudi = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.MARKET_ENTRY && (e.valueText ?? "").trim() !== "Saudi Arabia";

const F = OutcomeCoverageType;

export const TARGET_REGISTRY: TargetDefinition[] = [
  // ---- Funding Outcomes ----
  ...[6, 12, 24].map((m): TargetDefinition => ({
    name: `raisedNewRoundWithin${m}Months`, group: "FUNDING", coverageType: F.FUNDING, targetVersion: `FUNDING-${m}M-v1`, windowMonths: m, valueType: "boolean",
    calculate: (s, e, now, ctx) => windowedEventBooleanLabel(s.snapshotAt, e, m, isFundingRound, now, gateFor(ctx, F.FUNDING)),
  })),
  {
    name: "amountRaisedNext12Months", group: "FUNDING", coverageType: F.FUNDING, targetVersion: "FUNDING-AMOUNT-12M-v1", windowMonths: 12, valueType: "numeric",
    calculate: (s, e, now, ctx) => windowedSumLabel(s.snapshotAt, e, 12, isFundingRound, now, gateFor(ctx, F.FUNDING)),
  },

  // ---- Revenue Outcomes ----
  ...[6, 12, 24].map((m): TargetDefinition => ({
    name: `revenueGrowth${m}Months`, group: "REVENUE", coverageType: F.REVENUE, targetVersion: `REVENUE-GROWTH-${m}M-v1`, windowMonths: m, valueType: "numeric",
    calculate: (s, e, now, ctx) => windowedGrowthLabel(s.snapshotAt, s.features.annualRevenue, e, m, isRevenueUpdate, now, gateFor(ctx, F.REVENUE)),
  })),
  {
    name: "revenueGrowthAbove25Pct12Months", group: "REVENUE", coverageType: F.REVENUE, targetVersion: "REVENUE-GROWTH-ABOVE25-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => growthAboveThresholdLabel(windowedGrowthLabel(s.snapshotAt, s.features.annualRevenue, e, 12, isRevenueUpdate, now, gateFor(ctx, F.REVENUE)), 25),
  },
  {
    name: "revenueGrowthAbove50Pct12Months", group: "REVENUE", coverageType: F.REVENUE, targetVersion: "REVENUE-GROWTH-ABOVE50-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => growthAboveThresholdLabel(windowedGrowthLabel(s.snapshotAt, s.features.annualRevenue, e, 12, isRevenueUpdate, now, gateFor(ctx, F.REVENUE)), 50),
  },

  // ---- Customer / User Outcomes ----
  {
    name: "customerGrowth12Months", group: "CUSTOMER", coverageType: F.CUSTOMER, targetVersion: "CUSTOMER-GROWTH-12M-v1", windowMonths: 12, valueType: "numeric",
    calculate: (s, e, now, ctx) => windowedGrowthLabel(s.snapshotAt, s.features.customerCount, e, 12, isCustomerUpdate, now, gateFor(ctx, F.CUSTOMER)),
  },
  {
    name: "customerGrowthAbove25Pct12Months", group: "CUSTOMER", coverageType: F.CUSTOMER, targetVersion: "CUSTOMER-GROWTH-ABOVE25-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => growthAboveThresholdLabel(windowedGrowthLabel(s.snapshotAt, s.features.customerCount, e, 12, isCustomerUpdate, now, gateFor(ctx, F.CUSTOMER)), 25),
  },

  // ---- Regulatory Outcomes ----
  {
    name: "regulatoryMilestoneAdvancedWithin12Months", group: "REGULATORY", coverageType: F.REGULATORY, targetVersion: "REGULATORY-PROGRESS-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => regulatoryProgressionLabel(s.category, s.features.regulatoryMilestone, e, s.snapshotAt, 12, now, gateFor(ctx, F.REGULATORY)),
  },

  // ---- Commercialization Outcomes ----
  {
    name: "launchedCommerciallyWithin12Months", group: "COMMERCIALIZATION", coverageType: F.COMMERCIALIZATION, targetVersion: "COMMERCIAL-LAUNCH-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => windowedEventBooleanLabel(s.snapshotAt, e, 12, isCommercialLaunch, now, gateFor(ctx, F.COMMERCIALIZATION)),
  },
  {
    name: "signedCommercialPartnershipWithin12Months", group: "COMMERCIALIZATION", coverageType: F.PARTNERSHIP, targetVersion: "PARTNERSHIP-SIGNED-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => windowedEventBooleanLabel(s.snapshotAt, e, 12, isPartnershipSigned, now, gateFor(ctx, F.PARTNERSHIP)),
  },

  // ---- Geographic Expansion ----
  {
    name: "enteredNewCountryWithin12Months", group: "GEOGRAPHIC", coverageType: F.MARKET_ENTRY, targetVersion: "MARKET-ENTRY-12M-v1", windowMonths: 12, valueType: "boolean",
    calculate: (s, e, now, ctx) => windowedEventBooleanLabel(s.snapshotAt, e, 12, isMarketEntry, now, gateFor(ctx, F.MARKET_ENTRY)),
  },
  {
    name: "expandedOutsideSaudiWithin24Months", group: "GEOGRAPHIC", coverageType: F.MARKET_ENTRY, targetVersion: "MARKET-ENTRY-OUTSIDE-SAUDI-24M-v1", windowMonths: 24, valueType: "boolean",
    calculate: (s, e, now, ctx) => windowedEventBooleanLabel(s.snapshotAt, e, 24, isMarketEntryOutsideSaudi, now, gateFor(ctx, F.MARKET_ENTRY)),
  },

  // ---- Survival / Activity ----
  ...[12, 24].map((m): TargetDefinition => ({
    name: `activeAfter${m}Months`, group: "SURVIVAL", coverageType: F.SURVIVAL, targetVersion: `SURVIVAL-${m}M-v1`, windowMonths: m, valueType: "boolean",
    calculate: (s, e, now, ctx) => survivalLabel(s.snapshotAt, e, m, now, gateFor(ctx, F.SURVIVAL)),
  })),
];

export function getTarget(name: string): TargetDefinition | undefined {
  return TARGET_REGISTRY.find((t) => t.name === name);
}

/** The snapshot feature a target's baseline depends on. When a startup has
 * explicitly declared that feature NOT_APPLICABLE (and has no value), the
 * target itself does not apply to it and the row is EXCLUDED for that target
 * — rather than counted as a negative for an outcome it can never have. */
export const TARGET_BASELINE_FEATURE: Record<string, "annualRevenue" | "customerCount" | "regulatoryMilestone"> = {
  revenueGrowth6Months: "annualRevenue", revenueGrowth12Months: "annualRevenue", revenueGrowth24Months: "annualRevenue",
  revenueGrowthAbove25Pct12Months: "annualRevenue", revenueGrowthAbove50Pct12Months: "annualRevenue",
  customerGrowth12Months: "customerCount", customerGrowthAbove25Pct12Months: "customerCount",
  regulatoryMilestoneAdvancedWithin12Months: "regulatoryMilestone",
};
