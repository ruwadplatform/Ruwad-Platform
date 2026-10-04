/** Downloadable CSV templates (Phase 26/27) — hardcoded header + one
 * worked example row each, so a researcher never has to guess a column
 * name. Same rowsToCsv-style hand-rolled CSV as the rest of this module. */

const FEATURE_HEADER = [
  "record_type", "startup_name", "startup_domain", "country", "external_id",
  "field_key", "value_numeric", "value_text", "value_boolean", "currency",
  "effective_date", "published_at", "source_type", "source_name", "source_url",
  "verified", "verification_notes", "cohort_source",
];
const FEATURE_EXAMPLE = [
  "FEATURE", "Example Health", "examplehealth.com", "Saudi Arabia", "",
  "totalFundingRaised", "8000000", "", "", "SAR",
  "2023-01-01", "2023-01-05", "PUBLIC_COMPANY_SOURCE", "Example Health press release", "https://examplehealth.com/press/seed-round",
  "true", "Confirmed via company announcement", "MANUAL_RESEARCH",
];

const OUTCOME_HEADER = [
  "record_type", "startup_name", "startup_domain", "external_id",
  "event_type", "effective_date", "value_numeric", "value_text", "currency",
  "source_type", "source_name", "source_url", "published_at", "verified", "verification_notes",
];
const OUTCOME_EXAMPLE = [
  "OUTCOME_EVENT", "Example Health", "examplehealth.com", "",
  "FUNDING_ROUND", "2023-08-15", "5000000", "Series A", "SAR",
  "PUBLIC_NEWS_SOURCE", "MAGNiTT", "https://magnitt.com/news/example-health-series-a", "2023-08-16", "true", "",
];

const IDENTITY_HEADER = ["record_type", "startup_name", "startup_domain", "country", "external_id", "source_url", "source_name"];
const IDENTITY_EXAMPLE = ["IDENTITY", "Example Health", "examplehealth.com", "Saudi Arabia", "8841", "https://magnitt.com/company/example-health", "MAGNiTT"];

function toCsv(header: string[], example: string[]): string {
  const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header.join(","), example.map(escape).join(",")].join("\r\n");
}

export function historicalFeatureTemplateCsv(): string {
  return toCsv(FEATURE_HEADER, FEATURE_EXAMPLE);
}
export function historicalOutcomeTemplateCsv(): string {
  return toCsv(OUTCOME_HEADER, OUTCOME_EXAMPLE);
}
export function historicalIdentityTemplateCsv(): string {
  return toCsv(IDENTITY_HEADER, IDENTITY_EXAMPLE);
}
