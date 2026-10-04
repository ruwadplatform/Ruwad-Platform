import { HistoricalEvidenceSourceType, HistoricalRecordType, OutcomeEventSource, SourceReliability, StartupOutcomeEventType } from "../../common/enums";
import { ML_FEATURES_V1 } from "../ml-data.constants";
import { isCanonicalCountry, isRegulatoryLadderValue, REGULATORY_LADDER_VALUES } from "./canonical-vocab";

/** Hand-rolled RFC4180 CSV reader — mirrors ml-dataset-export.service.ts's
 * rowsToCsv() in spirit (no CSV library exists anywhere in this monorepo,
 * by deliberate convention). Handles quoted fields with embedded commas,
 * quotes ("") and newlines; accepts both \r\n and \n line endings. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const push = () => { row.push(field); field = ""; };
  const endRow = () => { push(); rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { push(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) endRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface RowError { rowNumber: number; message: string }

export interface ParsedFeatureRow {
  recordType: HistoricalRecordType.FEATURE;
  rowNumber: number;
  startupName: string;
  startupDomain?: string;
  country?: string;
  externalId?: string;
  fieldKey: string;
  valueNumeric?: number;
  valueText?: string;
  valueBoolean?: boolean;
  currency?: string;
  effectiveDate: string;
  publishedAt?: string;
  sourceType: HistoricalEvidenceSourceType;
  sourceName?: string;
  sourceUrl?: string;
  verified: boolean;
  verificationNotes?: string;
  cohortSource?: string;
}

export interface ParsedOutcomeEventRow {
  recordType: HistoricalRecordType.OUTCOME_EVENT;
  rowNumber: number;
  startupName: string;
  startupDomain?: string;
  externalId?: string;
  eventType: StartupOutcomeEventType;
  eventDate: string;
  valueNumeric?: number;
  valueText?: string;
  currency?: string;
  sourceType: HistoricalEvidenceSourceType;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  verified: boolean;
  verificationNotes?: string;
}

export interface ParsedIdentityRow {
  recordType: HistoricalRecordType.IDENTITY;
  rowNumber: number;
  startupName: string;
  startupDomain?: string;
  country?: string;
  externalId?: string;
  externalUrl?: string;
  sourceName: string;
}

export type ParsedRow = ParsedFeatureRow | ParsedOutcomeEventRow | ParsedIdentityRow;

export interface ParseResult { rows: ParsedRow[]; errors: RowError[] }

const RECORD_TYPES = new Set(Object.values(HistoricalRecordType));
const SOURCE_TYPES = new Set(Object.values(HistoricalEvidenceSourceType));
const EVENT_TYPES = new Set(Object.values(StartupOutcomeEventType));
const FEATURE_KEYS = new Set<string>(ML_FEATURES_V1);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function bool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === "") return undefined;
  const s = v.trim().toLowerCase();
  if (["true", "yes", "1"].includes(s)) return true;
  if (["false", "no", "0"].includes(s)) return false;
  return undefined;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function validDate(v: string | undefined): boolean {
  if (!v) return false;
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

/** The one place "no future-dated historical claim" is enforced at parse
 * time — a defensive check; the real leakage guarantee comes from
 * HistoricalSnapshotBuilder never reading evidence dated after the
 * snapshot it's building (see that service's own doc comment). */
function isFutureDate(v: string, now: Date): boolean {
  return new Date(`${v}T00:00:00Z`).getTime() > now.getTime();
}

/** Parses raw CSV text into typed, validated rows — never throws on a bad
 * row, collects a typed RowError instead so a dry run can report every
 * problem in one pass rather than failing at the first one. */
export function parseHistoricalCsv(text: string, now: Date = new Date()): ParseResult {
  const table = parseCsvText(text);
  const errors: RowError[] = [];
  if (!table.length) return { rows: [], errors: [{ rowNumber: 0, message: "File is empty" }] };

  const header = table[0].map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);
  const get = (row: string[], col: string): string | undefined => {
    const i = idx(col);
    if (i < 0) return undefined;
    const v = row[i]?.trim();
    return v === "" ? undefined : v;
  };

  const rows: ParsedRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const rowNumber = r + 1; // 1-indexed, header is row 1
    const raw = table[r];
    if (raw.length === 1 && raw[0].trim() === "") continue;

    const recordType = get(raw, "record_type");
    if (!recordType || !RECORD_TYPES.has(recordType as HistoricalRecordType)) {
      errors.push({ rowNumber, message: `Missing or unknown record_type "${recordType ?? ""}" — must be one of ${[...RECORD_TYPES].join(", ")}` });
      continue;
    }
    const startupName = get(raw, "startup_name");
    if (!startupName) { errors.push({ rowNumber, message: "startup_name is required" }); continue; }

    if (recordType === HistoricalRecordType.IDENTITY) {
      const sourceName = get(raw, "source_name");
      if (!sourceName) { errors.push({ rowNumber, message: "IDENTITY rows require source_name" }); continue; }
      rows.push({
        recordType: HistoricalRecordType.IDENTITY, rowNumber, startupName,
        startupDomain: get(raw, "startup_domain"), country: get(raw, "country"),
        externalId: get(raw, "external_id"), externalUrl: get(raw, "source_url"), sourceName,
      });
      continue;
    }

    const sourceType = get(raw, "source_type");
    if (!sourceType || !SOURCE_TYPES.has(sourceType as HistoricalEvidenceSourceType)) {
      errors.push({ rowNumber, message: `Missing or unknown source_type "${sourceType ?? ""}"` });
      continue;
    }
    const effectiveDateCol = recordType === HistoricalRecordType.FEATURE ? "effective_date" : "effective_date";
    const dateValue = get(raw, effectiveDateCol);
    if (!validDate(dateValue)) { errors.push({ rowNumber, message: `Invalid or missing ${effectiveDateCol} "${dateValue ?? ""}" — expected YYYY-MM-DD` }); continue; }
    if (isFutureDate(dateValue!, now)) { errors.push({ rowNumber, message: `${effectiveDateCol} "${dateValue}" is in the future — a historical fact cannot be dated after today` }); continue; }

    const currency = get(raw, "currency");
    if (currency && !CURRENCY_RE.test(currency)) { errors.push({ rowNumber, message: `Invalid currency code "${currency}" — expected a 3-letter ISO code (e.g. SAR, USD)` }); continue; }

    const publishedAt = get(raw, "published_at");
    if (publishedAt && !validDate(publishedAt)) { errors.push({ rowNumber, message: `Invalid published_at "${publishedAt}" — expected YYYY-MM-DD` }); continue; }

    if (recordType === HistoricalRecordType.FEATURE) {
      const fieldKey = get(raw, "field_key");
      if (!fieldKey || !FEATURE_KEYS.has(fieldKey)) { errors.push({ rowNumber, message: `Unknown field_key "${fieldKey ?? ""}" — must be one of the ML_FEATURES_V1 keys` }); continue; }
      const valueNumeric = num(get(raw, "value_numeric"));
      const valueText = get(raw, "value_text");
      const valueBoolean = bool(get(raw, "value_boolean"));
      if (valueNumeric === undefined && valueText === undefined && valueBoolean === undefined) {
        errors.push({ rowNumber, message: "At least one of value_numeric/value_text/value_boolean is required for a FEATURE row" });
        continue;
      }
      if (fieldKey === "regulatoryMilestone" && (valueText === undefined || !isRegulatoryLadderValue(valueText))) {
        errors.push({ rowNumber, message: `regulatoryMilestone value_text "${valueText ?? ""}" is not a regulatory ladder value — it must be copied exactly from one of: ${REGULATORY_LADDER_VALUES.join(" | ")}. Descriptions go in verification_notes.` });
        continue;
      }
      rows.push({
        recordType: HistoricalRecordType.FEATURE, rowNumber, startupName,
        startupDomain: get(raw, "startup_domain"), country: get(raw, "country"), externalId: get(raw, "external_id"),
        fieldKey, valueNumeric, valueText, valueBoolean, currency,
        effectiveDate: dateValue!, publishedAt,
        sourceType: sourceType as HistoricalEvidenceSourceType, sourceName: get(raw, "source_name"), sourceUrl: get(raw, "source_url"),
        verified: bool(get(raw, "verified")) ?? false, verificationNotes: get(raw, "verification_notes"),
        cohortSource: get(raw, "cohort_source"),
      });
      continue;
    }

    // OUTCOME_EVENT
    const eventType = get(raw, "event_type");
    if (!eventType || !EVENT_TYPES.has(eventType as StartupOutcomeEventType)) { errors.push({ rowNumber, message: `Unknown event_type "${eventType ?? ""}"` }); continue; }
    const outcomeText = get(raw, "value_text");
    if (eventType === StartupOutcomeEventType.MARKET_ENTRY && (outcomeText === undefined || !isCanonicalCountry(outcomeText))) {
      errors.push({ rowNumber, message: `MARKET_ENTRY value_text "${outcomeText ?? ""}" must be exactly one canonical destination country name (e.g. "Saudi Arabia", "United Arab Emirates") — no descriptions. Put the story in verification_notes.` });
      continue;
    }
    if ((eventType === StartupOutcomeEventType.REGULATORY_MILESTONE || eventType === StartupOutcomeEventType.REGULATORY_APPROVAL) && (outcomeText === undefined || !isRegulatoryLadderValue(outcomeText))) {
      errors.push({ rowNumber, message: `${eventType} value_text "${outcomeText ?? ""}" is not a regulatory ladder value — it must be copied exactly from one of: ${REGULATORY_LADDER_VALUES.join(" | ")}. Put the story in verification_notes.` });
      continue;
    }
    rows.push({
      recordType: HistoricalRecordType.OUTCOME_EVENT, rowNumber, startupName,
      startupDomain: get(raw, "startup_domain"), externalId: get(raw, "external_id"),
      eventType: eventType as StartupOutcomeEventType, eventDate: dateValue!,
      valueNumeric: num(get(raw, "value_numeric")), valueText: get(raw, "value_text"), currency,
      sourceType: sourceType as HistoricalEvidenceSourceType, sourceName: get(raw, "source_name"), sourceUrl: get(raw, "source_url"),
      publishedAt, verified: bool(get(raw, "verified")) ?? false, verificationNotes: get(raw, "verification_notes"),
    });
  }

  return { rows, errors };
}

/** Collapses the richer HistoricalEvidenceSourceType taxonomy down to the
 * 5-value OutcomeEventSource enum startup_outcome_events already uses —
 * every public/licensed/research/patent/clinical-trial source type reads
 * as PUBLIC_SOURCE there, since that table doesn't distinguish further. */
export function toOutcomeEventSource(t: HistoricalEvidenceSourceType): OutcomeEventSource {
  switch (t) {
    case HistoricalEvidenceSourceType.FOUNDER_REPORTED: return OutcomeEventSource.FOUNDER_REPORTED;
    case HistoricalEvidenceSourceType.ADMIN_ENTERED: return OutcomeEventSource.ADMIN_ENTERED;
    case HistoricalEvidenceSourceType.VERIFIED_DOCUMENT: return OutcomeEventSource.VERIFIED_DOCUMENT;
    case HistoricalEvidenceSourceType.SYSTEM_DERIVED: return OutcomeEventSource.SYSTEM_DERIVED;
    default: return OutcomeEventSource.PUBLIC_SOURCE;
  }
}

/** Default reliability tier per source type (Phase 2's worked examples) —
 * an admin controls reliability by choosing the right source_type in the
 * CSV, rather than a separate free-text override column nobody validates. */
export function defaultReliability(t: HistoricalEvidenceSourceType): SourceReliability {
  switch (t) {
    case HistoricalEvidenceSourceType.VERIFIED_DOCUMENT:
      return SourceReliability.PRIMARY;
    case HistoricalEvidenceSourceType.PUBLIC_COMPANY_SOURCE:
    case HistoricalEvidenceSourceType.PUBLIC_REGULATORY_SOURCE:
    case HistoricalEvidenceSourceType.PATENT_DATABASE:
    case HistoricalEvidenceSourceType.CLINICAL_TRIAL_REGISTRY:
    case HistoricalEvidenceSourceType.ADMIN_ENTERED:
      return SourceReliability.HIGH;
    case HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE:
    case HistoricalEvidenceSourceType.LICENSED_DATABASE:
    case HistoricalEvidenceSourceType.RESEARCH_DATABASE:
    case HistoricalEvidenceSourceType.FOUNDER_REPORTED:
      return SourceReliability.MEDIUM;
    default:
      return SourceReliability.LOW;
  }
}
