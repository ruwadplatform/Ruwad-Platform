import { BadRequestException } from "@nestjs/common";
import { FeatureApplicabilityStatus, HistoricalSubmissionKind, OutcomeCoverageType, StartupOutcomeEventType } from "../common/enums";
import { LADDERS, pathwayFor } from "../scoring/engines/regulatory.engine";
import { MIN_NOT_APPLICABLE_REASON_CHARS } from "./feature-applicability";

/** Pure validation + mapping for historical-data entries. No database. Every
 * entry is validated into a normalised payload, then mapped to the rows an
 * approval would write ("planned writes") — the same mapping powers the
 * admin's preview and the materialisation, so what the reviewer sees is
 * exactly what gets written. Nothing here converts currencies, annualises,
 * or turns one metric into another: a value either maps cleanly to one
 * existing feature or is stored for reference and left out of the features. */

export const REVENUE_TYPES = ["RECOGNIZED", "ARR", "MRR", "GMV", "OTHER"] as const;
export type RevenueType = (typeof REVENUE_TYPES)[number];

export const CUSTOMER_METRIC_TYPES = ["CUSTOMERS", "PATIENTS", "USERS", "CLINICS", "HOSPITALS", "ENTERPRISE_CLIENTS", "TESTS"] as const;
export type CustomerMetricType = (typeof CUSTOMER_METRIC_TYPES)[number];

export const CURRENCIES = ["SAR", "USD", "EUR", "GBP", "AED", "KWD", "QAR", "BHD", "OMR", "JOD", "EGP"] as const;

export const SUPPORTING_DOCUMENT_TYPES = [
  "FINANCIAL_STATEMENT", "MANAGEMENT_REPORT", "INVESTOR_REPORT", "PITCH_DECK", "SFDA_DOCUMENT", "CUSTOMER_REPORT", "ACCELERATOR_REPORT", "FUNDING_ANNOUNCEMENT", "OTHER",
] as const;

/** Coverage families a founder may attest; SURVIVAL is admin-only (a founder
 * "attesting" they did not shut down proves nothing a reviewer can check). */
export const FOUNDER_ATTESTABLE_FAMILIES = Object.values(OutcomeCoverageType).filter((f) => f !== OutcomeCoverageType.SURVIVAL);

export const REGULATORY_ANSWERS = ["YES", "NO", "UNSURE"] as const;

export interface ValidationContext {
  /** The startup's category — decides which regulatory ladder applies. */
  startupCategory: string;
  /** YYYY-MM-DD "today" (injected so tests are deterministic). */
  today: string;
  /** Who is entering it; founders get the narrower coverage-family list. */
  actor: "FOUNDER" | "ADMIN";
}

export interface ValidatedEntry {
  kind: HistoricalSubmissionKind;
  /** The date the fact was true — the leakage anchor stored on the submission. */
  effectiveDate: string;
  payload: Record<string, unknown>;
}

export interface PlannedEvidence {
  fieldKey: string;
  valueNumeric?: number;
  valueText?: string;
  currency?: string;
  effectiveDate: string;
  note?: string;
}
export interface PlannedEvent { eventType: StartupOutcomeEventType; eventDate: string; valueNumeric?: number; valueText?: string; notes?: string }
export interface PlannedWrites {
  evidence: PlannedEvidence[];
  event?: PlannedEvent;
  applicability?: { featureKey: string; status: FeatureApplicabilityStatus; effectiveDate: string; reason?: string };
  career?: { founderName: string; careerStartYear: number; domainStartYear?: number; roleHistory?: { title: string; organization?: string; startYear: number; endYear?: number }[]; teamMemberId?: string };
  coverage?: { coverageType: OutcomeCoverageType; coverageThrough: string; sourceSummary: string };
  /** Why part of an entry is stored for reference only. */
  notes: string[];
}

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown, max = 500): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const daysBetween = (a: string, b: string): number => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

function money(raw: Record<string, unknown>, errors: string[], label: string): { amount: number; currency: string; sarAmount: number; fxSource?: string; fxDate?: string } | null {
  const amount = raw.amount;
  const currency = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "SAR";
  if (!isNum(amount) || amount < 0) { errors.push(`${label}: amount must be a number of zero or more.`); return null; }
  if (!(CURRENCIES as readonly string[]).includes(currency)) { errors.push(`${label}: currency must be one of ${CURRENCIES.join(", ")}.`); return null; }
  if (currency === "SAR") return { amount, currency, sarAmount: amount };
  const sar = raw.sarEquivalent;
  const fxSource = str(raw.fxSource, 200);
  if (!isNum(sar) || sar < 0 || !fxSource) {
    errors.push(`${label}: RUWĀD never converts currencies automatically. For ${currency} please also give the SAR equivalent (sarEquivalent) and where the rate came from (fxSource).`);
    return null;
  }
  const fxDate = isIso(raw.fxDate) ? raw.fxDate : undefined;
  return { amount, currency, sarAmount: sar, fxSource, fxDate };
}

function fail(errors: string[]): never {
  throw new BadRequestException({ message: errors, error: "Bad Request", statusCode: 400 });
}

/** Validates one entry; throws a 400 listing every problem found. */
export function validateEntry(kind: HistoricalSubmissionKind, raw: unknown, ctx: ValidationContext): ValidatedEntry {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail(["The entry must be an object."]);
  const r = raw as Record<string, unknown>;
  const currentYear = Number(ctx.today.slice(0, 4));
  const notFuture = (d: string, label: string) => { if (d > ctx.today) errors.push(`${label} cannot be in the future.`); };
  let effectiveDate = "";
  const payload: Record<string, unknown> = {};

  switch (kind) {
    case HistoricalSubmissionKind.REVENUE: {
      const revenueType = String(r.revenueType ?? "").toUpperCase();
      if (!(REVENUE_TYPES as readonly string[]).includes(revenueType)) errors.push(`revenueType must be one of ${REVENUE_TYPES.join(", ")}.`);
      if (!isIso(r.periodEnd)) errors.push("periodEnd must be a valid YYYY-MM-DD date (the last day the figure covers).");
      else { effectiveDate = r.periodEnd; notFuture(r.periodEnd, "periodEnd"); }
      if (r.periodStart !== undefined && r.periodStart !== null && r.periodStart !== "") {
        if (!isIso(r.periodStart)) errors.push("periodStart must be a valid YYYY-MM-DD date.");
        else if (isIso(r.periodEnd) && r.periodStart >= r.periodEnd) errors.push("periodStart must be before periodEnd.");
      }
      const m = money(r, errors, "Revenue");
      if (!errors.length && m) {
        Object.assign(payload, { revenueType, periodStart: isIso(r.periodStart) ? r.periodStart : undefined, periodEnd: r.periodEnd, amount: m.amount, currency: m.currency, sarAmount: m.sarAmount, fxSource: m.fxSource, fxDate: m.fxDate });
      }
      break;
    }
    case HistoricalSubmissionKind.CUSTOMER_METRIC: {
      const metricType = String(r.metricType ?? "").toUpperCase();
      if (!(CUSTOMER_METRIC_TYPES as readonly string[]).includes(metricType)) errors.push(`metricType must be one of ${CUSTOMER_METRIC_TYPES.join(", ")}.`);
      if (!isIso(r.asOfDate)) errors.push("asOfDate must be a valid YYYY-MM-DD date.");
      else { effectiveDate = r.asOfDate; notFuture(r.asOfDate, "asOfDate"); }
      if (!isNum(r.value) || r.value < 0 || !Number.isInteger(r.value)) errors.push("value must be a whole number of zero or more.");
      if (!errors.length) Object.assign(payload, { metricType, asOfDate: r.asOfDate, value: r.value, context: str(r.context, 300) });
      break;
    }
    case HistoricalSubmissionKind.TEAM_SIZE: {
      if (!isIso(r.asOfDate)) errors.push("asOfDate must be a valid YYYY-MM-DD date.");
      else { effectiveDate = r.asOfDate; notFuture(r.asOfDate, "asOfDate"); }
      if (!isNum(r.teamSize) || !Number.isInteger(r.teamSize) || r.teamSize < 1 || r.teamSize > 100_000) errors.push("teamSize must be a whole number of at least 1.");
      if (!errors.length) Object.assign(payload, { asOfDate: r.asOfDate, teamSize: r.teamSize });
      break;
    }
    case HistoricalSubmissionKind.FOUNDER_CAREER: {
      const founderName = str(r.founderName, 200);
      if (!founderName) errors.push("founderName is required.");
      const start = r.careerStartYear;
      if (!isNum(start) || !Number.isInteger(start) || start < 1950 || start > currentYear) errors.push(`careerStartYear must be a year between 1950 and ${currentYear}.`);
      let domain: number | undefined;
      if (r.domainStartYear !== undefined && r.domainStartYear !== null && r.domainStartYear !== "") {
        if (!isNum(r.domainStartYear) || !Number.isInteger(r.domainStartYear) || r.domainStartYear > currentYear || (isNum(start) && r.domainStartYear < start)) errors.push("domainStartYear must be a year on or after careerStartYear and not in the future.");
        else domain = r.domainStartYear;
      }
      const roles: { title: string; organization?: string; startYear: number; endYear?: number }[] = [];
      if (r.roleHistory !== undefined && r.roleHistory !== null) {
        if (!Array.isArray(r.roleHistory) || r.roleHistory.length > 30) errors.push("roleHistory must be a list of at most 30 roles.");
        else for (const [i, role] of (r.roleHistory as Record<string, unknown>[]).entries()) {
          const title = str(role?.title, 200);
          if (!title || !isNum(role?.startYear) || role.startYear > currentYear || (isNum(role?.endYear) && role.endYear < (role.startYear as number))) errors.push(`roleHistory[${i}] needs a title and a valid start year (and an end year not before it).`);
          else roles.push({ title, organization: str(role.organization, 200), startYear: role.startYear as number, endYear: isNum(role.endYear) ? role.endYear : undefined });
        }
      }
      if (isNum(start) && Number.isInteger(start)) effectiveDate = `${start}-01-01`;
      if (!errors.length) Object.assign(payload, { founderName, careerStartYear: start, domainStartYear: domain, roleHistory: roles.length ? roles : undefined, teamMemberId: str(r.teamMemberId, 64) });
      break;
    }
    case HistoricalSubmissionKind.REGULATORY_APPLICABILITY: {
      const answer = String(r.answer ?? "").toUpperCase();
      if (!(REGULATORY_ANSWERS as readonly string[]).includes(answer)) errors.push(`answer must be one of ${REGULATORY_ANSWERS.join(", ")}.`);
      if (!isIso(r.asOfDate)) errors.push("asOfDate must be a valid YYYY-MM-DD date.");
      else { effectiveDate = r.asOfDate; notFuture(r.asOfDate, "asOfDate"); }
      const reason = str(r.reason, 1000);
      if (answer === "NO" && (!reason || reason.length < MIN_NOT_APPLICABLE_REASON_CHARS)) errors.push(`If no regulatory pathway applies, please explain why (at least ${MIN_NOT_APPLICABLE_REASON_CHARS} characters).`);
      if (!errors.length) Object.assign(payload, { answer, asOfDate: r.asOfDate, reason });
      break;
    }
    case HistoricalSubmissionKind.REGULATORY_MILESTONE: {
      const ladder = LADDERS[pathwayFor(ctx.startupCategory)];
      const wanted = typeof r.milestone === "string" ? r.milestone.trim().toLowerCase() : "";
      const canonical = ladder.find((s) => s.toLowerCase() === wanted);
      if (!canonical) errors.push(`milestone must be exactly one of the stages for this company's regulatory pathway: ${ladder.join("; ")}. Use the explanation field for anything else.`);
      if (!isIso(r.asOfDate)) errors.push("asOfDate must be a valid YYYY-MM-DD date (the day the stage was reached).");
      else { effectiveDate = r.asOfDate; notFuture(r.asOfDate, "asOfDate"); }
      if (!errors.length) Object.assign(payload, { milestone: canonical, asOfDate: r.asOfDate, explanation: str(r.explanation, 1000) });
      break;
    }
    case HistoricalSubmissionKind.FUNDING_ROUND: {
      if (!isIso(r.date)) errors.push("date must be a full YYYY-MM-DD date. A month alone is not enough: an approximate date would be recorded as exact.");
      else { effectiveDate = r.date; notFuture(r.date, "date"); }
      const roundType = str(r.roundType, 100);
      if (!roundType) errors.push("roundType is required (for example Pre-Seed, Seed, Series A, Grant).");
      let m: ReturnType<typeof money> = null;
      if (r.amount !== undefined && r.amount !== null && r.amount !== "") m = money(r, errors, "Funding amount");
      const others = Array.isArray(r.otherInvestors) ? (r.otherInvestors as unknown[]).map((x) => str(x, 200)).filter((x): x is string => !!x).slice(0, 30) : [];
      if (!errors.length) Object.assign(payload, { date: r.date, roundType, amount: m?.amount, currency: m?.currency, sarAmount: m?.sarAmount, fxSource: m?.fxSource, fxDate: m?.fxDate, leadInvestor: str(r.leadInvestor, 200), otherInvestors: others.length ? others : undefined });
      break;
    }
    case HistoricalSubmissionKind.COVERAGE_ATTESTATION: {
      const coverageType = String(r.coverageType ?? "").toUpperCase();
      const allowed = ctx.actor === "ADMIN" ? Object.values(OutcomeCoverageType) : FOUNDER_ATTESTABLE_FAMILIES;
      if (!(allowed as string[]).includes(coverageType)) errors.push(`coverageType must be one of ${allowed.join(", ")}.`);
      if (!isIso(r.coverageThrough)) errors.push("coverageThrough must be a valid YYYY-MM-DD date.");
      else { effectiveDate = r.coverageThrough; notFuture(r.coverageThrough, "coverageThrough"); }
      const statement = str(r.statement, 1000);
      if (!statement || statement.length < 10) errors.push("statement must say what was checked and how (at least 10 characters).");
      if (!errors.length) Object.assign(payload, { coverageType, coverageThrough: r.coverageThrough, statement });
      break;
    }
    default:
      errors.push(`Unknown entry kind "${String(kind)}".`);
  }

  if (errors.length) fail(errors);
  return { kind, effectiveDate, payload: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) };
}

/** Which rows an approved entry writes. Revenue maps to a feature only when
 * its meaning is unambiguous. */
export function plannedWrites(kind: HistoricalSubmissionKind, effectiveDate: string, p: Record<string, unknown>): PlannedWrites {
  const out: PlannedWrites = { evidence: [], notes: [] };
  switch (kind) {
    case HistoricalSubmissionKind.REVENUE: {
      const type = p.revenueType as RevenueType;
      const sar = p.sarAmount as number;
      const orig = p.currency !== "SAR" ? ` Reported as ${p.amount} ${p.currency}; SAR equivalent supplied by the submitter (source: ${p.fxSource}${p.fxDate ? `, ${p.fxDate}` : ""}).` : "";
      const start = p.periodStart as string | undefined;
      if (type === "RECOGNIZED") {
        const days = start ? daysBetween(start, effectiveDate) : null;
        if (days !== null && days >= 330 && days <= 400) out.evidence.push({ fieldKey: "annualRevenue", valueNumeric: sar, currency: "SAR", effectiveDate, note: `Recognized revenue for ${start} to ${effectiveDate}.${orig}` });
        else out.notes.push("Recognized revenue is only used as annualRevenue for a full-year period (about 12 months with a start and end date). It is stored for reference but not used as a feature.");
      } else if (type === "ARR") {
        out.evidence.push({ fieldKey: "recurringRevenue", valueNumeric: sar, currency: "SAR", effectiveDate, note: `Annual recurring revenue as of ${effectiveDate}.${orig}` });
        out.notes.push("ARR is recorded as recurringRevenue. It is NOT converted into annualRevenue.");
      } else {
        out.notes.push(`${type} is stored for reference and is not used as an ML feature: it is not recognized annual revenue and RUWĀD does not convert it.`);
      }
      break;
    }
    case HistoricalSubmissionKind.CUSTOMER_METRIC: {
      const type = p.metricType as CustomerMetricType;
      if (type === "USERS") out.evidence.push({ fieldKey: "activeUsers", valueNumeric: p.value as number, effectiveDate, note: p.context as string | undefined });
      else out.evidence.push({ fieldKey: "customerCount", valueNumeric: p.value as number, valueText: type, effectiveDate, note: p.context as string | undefined });
      out.notes.push(`Recorded as a ${type} series. Values of different metric types are never combined into one growth series.`);
      break;
    }
    case HistoricalSubmissionKind.TEAM_SIZE:
      out.evidence.push({ fieldKey: "teamSize", valueNumeric: p.teamSize as number, effectiveDate });
      break;
    case HistoricalSubmissionKind.FOUNDER_CAREER:
      out.career = { founderName: p.founderName as string, careerStartYear: p.careerStartYear as number, domainStartYear: p.domainStartYear as number | undefined, roleHistory: p.roleHistory as never, teamMemberId: p.teamMemberId as string | undefined };
      out.notes.push("founderExperienceYears (and healthcareExperienceYears) are derived from these start years as of each snapshot date, using the strongest founder, not typed in.");
      break;
    case HistoricalSubmissionKind.REGULATORY_APPLICABILITY: {
      const answer = p.answer as string;
      out.applicability = {
        featureKey: "regulatoryMilestone", effectiveDate,
        status: answer === "YES" ? FeatureApplicabilityStatus.APPLICABLE : answer === "NO" ? FeatureApplicabilityStatus.NOT_APPLICABLE : FeatureApplicabilityStatus.UNKNOWN,
        reason: p.reason as string | undefined,
      };
      break;
    }
    case HistoricalSubmissionKind.REGULATORY_MILESTONE:
      out.evidence.push({ fieldKey: "regulatoryMilestone", valueText: p.milestone as string, effectiveDate, note: p.explanation as string | undefined });
      out.event = { eventType: StartupOutcomeEventType.REGULATORY_MILESTONE, eventDate: effectiveDate, valueText: p.milestone as string, notes: p.explanation as string | undefined };
      break;
    case HistoricalSubmissionKind.FUNDING_ROUND: {
      const bits = [p.leadInvestor ? `Lead: ${p.leadInvestor}.` : "", Array.isArray(p.otherInvestors) ? `Others: ${(p.otherInvestors as string[]).join(", ")}.` : "", p.currency && p.currency !== "SAR" ? `Reported as ${p.amount} ${p.currency} (SAR equivalent supplied; source: ${p.fxSource}).` : ""].filter(Boolean);
      out.event = { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: effectiveDate, valueNumeric: p.sarAmount as number | undefined, valueText: p.roundType as string, notes: bits.join(" ") || undefined };
      break;
    }
    case HistoricalSubmissionKind.COVERAGE_ATTESTATION:
      out.coverage = { coverageType: p.coverageType as OutcomeCoverageType, coverageThrough: p.coverageThrough as string, sourceSummary: p.statement as string };
      break;
  }
  return out;
}

export interface FundingDuplicateCandidate { source: "OUTCOME_EVENT" | "PROFILE_ROUND"; id: string; date: string; amount?: number; round?: string; match: "EXACT" | "NEARBY" }

/** Finds funding rounds the company already has on file. EXACT (same day, same
 * amount) is blocked; NEARBY (within 31 days, or the same month in the
 * month-precision profile rounds) is flagged for the reviewer. */
export function findFundingDuplicates(
  candidate: { date: string; sarAmount?: number },
  events: { id: string; eventDate: string; valueNumeric?: number | null; valueText?: string | null }[],
  profileRounds: { id: string; date: string; amount: number; round: string }[],
): FundingDuplicateCandidate[] {
  const out: FundingDuplicateCandidate[] = [];
  for (const e of events) {
    const diff = Math.abs(daysBetween(candidate.date, e.eventDate));
    if (diff === 0 && (e.valueNumeric ?? null) === (candidate.sarAmount ?? null)) out.push({ source: "OUTCOME_EVENT", id: e.id, date: e.eventDate, amount: e.valueNumeric ?? undefined, round: e.valueText ?? undefined, match: "EXACT" });
    else if (diff <= 31) out.push({ source: "OUTCOME_EVENT", id: e.id, date: e.eventDate, amount: e.valueNumeric ?? undefined, round: e.valueText ?? undefined, match: "NEARBY" });
  }
  for (const p of profileRounds) {
    // profile rounds carry only "YYYY-MM" (and their amount units are not guaranteed), so a same-month match is flagged for the reviewer, never blocked
    if (p.date.slice(0, 7) === candidate.date.slice(0, 7)) out.push({ source: "PROFILE_ROUND", id: p.id, date: p.date, amount: Number(p.amount), round: p.round, match: "NEARBY" });
  }
  return out;
}
