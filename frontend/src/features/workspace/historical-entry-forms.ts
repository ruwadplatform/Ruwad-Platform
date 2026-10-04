import type { HistoricalOptions, HistoricalSubmissionKind } from "@/lib/api/historical-performance";

/** Field definitions for the "Historical Performance" form. The backend re-validates
 * everything; this only decides what to ask and how to shape the entry. Founders are
 * asked for dated facts (years, dates, counts) — never for a derived "years of
 * experience" figure, and never for anything that would let them set provenance. */
export type FieldType = "text" | "number" | "date" | "select" | "textarea";
export interface EntryField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: (o: HistoricalOptions) => { value: string; label: string }[];
  /** Only shown when this returns true for the current values. */
  showIf?: (v: Record<string, string>) => boolean;
  /** Comma-separated list rendered as an array. */
  list?: boolean;
  integer?: boolean;
}

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));
const needsFx = (v: Record<string, string>) => !!v.currency && v.currency !== "SAR";

const money = (amountLabel: string): EntryField[] => [
  { name: "amount", label: amountLabel, type: "number", required: true },
  { name: "currency", label: "Currency", type: "select", required: true, options: (o) => o.currencies.map((c) => ({ value: c, label: c })) },
  { name: "sarEquivalent", label: "Equivalent in SAR", type: "number", required: true, showIf: needsFx, hint: "RUWĀD never converts currencies for you. Give the SAR figure you used." },
  { name: "fxSource", label: "Where the exchange rate came from", type: "text", required: true, showIf: needsFx },
];

export const KIND_LABEL: Record<HistoricalSubmissionKind, string> = {
  REVENUE: "Revenue",
  CUSTOMER_METRIC: "Customers & usage",
  TEAM_SIZE: "Team size",
  FOUNDER_CAREER: "Founder background",
  REGULATORY_APPLICABILITY: "Regulatory pathway",
  REGULATORY_MILESTONE: "Regulatory milestone reached",
  FUNDING_ROUND: "Funding round",
  COVERAGE_ATTESTATION: "Completeness of your records",
};

export const KIND_HELP: Record<HistoricalSubmissionKind, string> = {
  REVENUE: "Revenue for a period, e.g. FY2023. Only full-year recognized revenue is used as annual revenue. ARR, MRR and GMV are kept separately and never treated as revenue.",
  CUSTOMER_METRIC: "How many customers, patients, users, clinics… you had on a date. Each type is tracked as its own series, so please keep using the same type over time.",
  TEAM_SIZE: "How many people were on the team on a given date.",
  FOUNDER_CAREER: "When each founder's career (and healthcare career) began. RUWĀD works out years of experience as of each date itself, so there is no need to calculate it.",
  REGULATORY_APPLICABILITY: "Does the product you are assessed on need a regulatory pathway? If not, say why. This does not count as 'no data': it is reviewed before it is used.",
  REGULATORY_MILESTONE: "A stage your product reached, chosen from the stages for your company's pathway, with the date it was reached.",
  FUNDING_ROUND: "A funding round with its exact date. Rounds already on file are detected so nothing is counted twice.",
  COVERAGE_ATTESTATION: "Confirm that the entries you gave for an area are complete up to a date (for example 'this is every funding round we have raised to 30 June 2026'). Reviewed before it is used.",
};

export const KIND_FIELDS: Record<HistoricalSubmissionKind, EntryField[]> = {
  REVENUE: [
    { name: "revenueType", label: "Type of figure", type: "select", required: true, options: (o) => opts(o.revenueTypes) },
    { name: "periodStart", label: "Period start", type: "date", hint: "Needed for a full-year revenue figure." },
    { name: "periodEnd", label: "Period end", type: "date", required: true },
    ...money("Amount"),
  ],
  CUSTOMER_METRIC: [
    { name: "metricType", label: "What are you counting?", type: "select", required: true, options: (o) => opts(o.customerMetricTypes) },
    { name: "asOfDate", label: "As of", type: "date", required: true },
    { name: "value", label: "Number", type: "number", required: true, integer: true },
    { name: "context", label: "Context (optional)", type: "text" },
  ],
  TEAM_SIZE: [
    { name: "asOfDate", label: "As of", type: "date", required: true },
    { name: "teamSize", label: "People on the team", type: "number", required: true, integer: true },
  ],
  FOUNDER_CAREER: [
    { name: "founderName", label: "Founder", type: "text", required: true },
    { name: "careerStartYear", label: "Year their professional career began", type: "number", required: true, integer: true },
    { name: "domainStartYear", label: "Year they began working in healthcare / life sciences", type: "number", integer: true },
  ],
  REGULATORY_APPLICABILITY: [
    { name: "answer", label: "Does your product require a regulatory pathway?", type: "select", required: true, options: (o) => o.regulatoryAnswers.map((a) => ({ value: a, label: a === "YES" ? "Yes" : a === "NO" ? "No" : "Unsure" })) },
    { name: "asOfDate", label: "True since", type: "date", required: true },
    { name: "reason", label: "Why not?", type: "textarea", required: true, showIf: (v) => v.answer === "NO", hint: "A short explanation, for example: 'A marketplace connecting patients and clinics; we do not supply a regulated product.'" },
  ],
  REGULATORY_MILESTONE: [
    { name: "milestone", label: "Stage reached", type: "select", required: true, options: (o) => o.regulatoryLadder.map((s) => ({ value: s, label: s })) },
    { name: "asOfDate", label: "Date reached", type: "date", required: true },
    { name: "explanation", label: "Details (optional)", type: "textarea", hint: "Free text goes here, not in the stage." },
  ],
  FUNDING_ROUND: [
    { name: "date", label: "Date closed", type: "date", required: true },
    { name: "roundType", label: "Round", type: "text", required: true, hint: "For example Pre-Seed, Seed, Series A, Grant." },
    ...money("Amount").map((f) => (f.name === "amount" ? { ...f, required: false } : f)),
    { name: "leadInvestor", label: "Lead investor (optional)", type: "text" },
    { name: "otherInvestors", label: "Other investors (optional, comma separated)", type: "text", list: true },
  ],
  COVERAGE_ATTESTATION: [
    { name: "coverageType", label: "Area", type: "select", required: true, options: (o) => opts(o.attestableFamilies) },
    { name: "coverageThrough", label: "Complete up to", type: "date", required: true },
    { name: "statement", label: "What this covers", type: "textarea", required: true },
  ],
};

/** Shapes the raw string state into the entry the API expects (numbers as numbers, empty fields dropped). */
export function buildEntry(kind: HistoricalSubmissionKind, values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of KIND_FIELDS[kind]) {
    if (f.showIf && !f.showIf(values)) continue;
    const raw = (values[f.name] ?? "").trim();
    if (!raw) continue;
    if (f.type === "number") out[f.name] = Number(raw);
    else if (f.list) out[f.name] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    else out[f.name] = raw;
  }
  return out;
}

/** Fills the form from an existing entry's payload (to revise one sent back). */
export function valuesFromPayload(kind: HistoricalSubmissionKind, payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of KIND_FIELDS[kind]) {
    const v = payload[f.name] ?? (f.name === "reason" ? payload.reason : undefined);
    if (v === undefined || v === null) continue;
    out[f.name] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  if (kind === "COVERAGE_ATTESTATION" && payload.statement) out.statement = String(payload.statement);
  return out;
}

/** One-line human summary of an entry for the list. */
export function summarizeEntry(kind: HistoricalSubmissionKind, p: Record<string, unknown>): string {
  const money = (a: unknown, c: unknown) => `${Number(a).toLocaleString()} ${String(c ?? "SAR")}`;
  switch (kind) {
    case "REVENUE": return `${String(p.revenueType).toLowerCase()} · ${money(p.amount, p.currency)} · ${p.periodStart ? `${p.periodStart} to ` : "to "}${p.periodEnd}`;
    case "CUSTOMER_METRIC": return `${Number(p.value).toLocaleString()} ${String(p.metricType).toLowerCase().replace(/_/g, " ")} · ${p.asOfDate}`;
    case "TEAM_SIZE": return `${p.teamSize} people · ${p.asOfDate}`;
    case "FOUNDER_CAREER": return `${p.founderName} · career from ${p.careerStartYear}${p.domainStartYear ? `, healthcare from ${p.domainStartYear}` : ""}`;
    case "REGULATORY_APPLICABILITY": return `${p.answer === "YES" ? "Pathway applies" : p.answer === "NO" ? "No regulatory pathway" : "Unsure"} · since ${p.asOfDate}`;
    case "REGULATORY_MILESTONE": return `${p.milestone} · ${p.asOfDate}`;
    case "FUNDING_ROUND": return `${p.roundType}${p.amount != null ? ` · ${money(p.amount, p.currency)}` : ""} · ${p.date}`;
    case "COVERAGE_ATTESTATION": return `${String(p.coverageType).toLowerCase().replace(/_/g, " ")} records complete to ${p.coverageThrough}`;
  }
}
