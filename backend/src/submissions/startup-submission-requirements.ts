import { pathwayFor } from "../scoring/engines/regulatory.engine";

type Payload = Record<string, unknown>;

/** Categories where "active users" is asked for — kept in step with DIGITAL_HEALTH_LIKE_CATEGORIES in the frontend wizard schema. */
const DIGITAL_HEALTH_LIKE_CATEGORIES = ["Digital Health", "Telemedicine", "Healthcare IT", "AI Healthcare", "Health Data"];

const isText = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const isCount = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Traction & Growth fields every startup must answer ("0" is a valid answer — blank is not). */
const TRACTION_FIELDS: Array<{ key: string; label: string; applies?: (category: string) => boolean }> = [
  { key: "annualRevenue", label: "Annual Revenue" },
  { key: "previousAnnualRevenue", label: "Previous Year's Annual Revenue" },
  { key: "recurringRevenue", label: "Recurring Revenue", applies: (c) => pathwayFor(c) !== "THERAPEUTIC" },
  { key: "customerCount", label: "Current Customers" },
  { key: "previousCustomerCount", label: "Previous Year's Customers" },
  { key: "activeUsers", label: "Active Users", applies: (c) => DIGITAL_HEALTH_LIKE_CATEGORIES.includes(c) },
  { key: "partnershipsCount", label: "Active Partnerships" },
  { key: "monthlyBurn", label: "Monthly Burn" },
  { key: "cashAvailable", label: "Cash Available" },
];

const CONTACT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "contactName", label: "Primary Contact Name" },
  { key: "contactEmail", label: "Primary Contact Email" },
  { key: "contactPhone", label: "Primary Contact Phone" },
  { key: "contactLinkedin", label: "Primary Contact LinkedIn" },
];

/** What a startup must provide to be submitted for admin review, on top of the DTO checks. These mirror the required fields in the
 * wizard schema (frontend/src/features/submissions/schemas/startup.ts) so the API enforces them even when the form is bypassed.
 * Applied when a submission is sent for review — drafts stay free to save half-filled. */
export function startupSubmissionProblems(payload: Payload): string[] {
  const problems: string[] = [];
  const category = typeof payload.category === "string" ? payload.category : "";

  const members = [payload.founders, payload.teamMembers]
    .flatMap((list) => (Array.isArray(list) ? (list as Payload[]) : []))
    .filter((m) => m && typeof m === "object" && isText(m.name));
  if (members.length < 1) problems.push("Add at least one team member (Founders & Team).");

  for (const f of TRACTION_FIELDS) {
    if (f.applies && !f.applies(category)) continue;
    if (!isCount(payload[f.key])) problems.push(`${f.label} is required (Funding → Traction & Growth); enter 0 if none.`);
  }

  if (!isCount(payload.patentsGranted)) problems.push("Patents Granted is required (Clinical & Regulatory); enter 0 if none.");
  if (!isCount(payload.patentsPending)) problems.push("Patents Pending is required (Clinical & Regulatory); enter 0 if none.");
  if (!isText(payload.regulatoryMilestone)) problems.push("Regulatory Strategy Status is required (Clinical & Regulatory).");

  for (const f of CONTACT_FIELDS) {
    if (!isText(payload[f.key])) problems.push(`${f.label} is required (Contacts & Documents → Primary Contact).`);
  }
  return problems;
}
