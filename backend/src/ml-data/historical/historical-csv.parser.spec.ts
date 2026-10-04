import { parseCsvText, parseHistoricalCsv, toOutcomeEventSource, defaultReliability } from "./historical-csv.parser";
import { HistoricalEvidenceSourceType, HistoricalRecordType, OutcomeEventSource, SourceReliability } from "../../common/enums";

const NOW = new Date("2026-01-01T00:00:00Z");

function csv(...lines: string[]): string {
  return lines.join("\r\n");
}

describe("parseCsvText", () => {
  it("splits a simple comma-separated file into rows/columns", () => {
    const rows = parseCsvText("a,b,c\r\n1,2,3\r\n");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields containing commas, quotes and newlines", () => {
    const rows = parseCsvText('a,b\r\n"hello, world","she said ""hi""\nline2"');
    expect(rows[1]).toEqual(["hello, world", 'she said "hi"\nline2']);
  });
});

describe("parseHistoricalCsv — FEATURE rows", () => {
  it("parses a valid FEATURE row", () => {
    const text = csv(
      "record_type,startup_name,startup_domain,country,external_id,field_key,value_numeric,value_text,value_boolean,currency,effective_date,published_at,source_type,source_name,source_url,verified,verification_notes,cohort_source",
      "FEATURE,Example Health,examplehealth.com,Saudi Arabia,,totalFundingRaised,8000000,,,SAR,2023-01-01,2023-01-05,PUBLIC_COMPANY_SOURCE,Press release,https://x.com/a,true,confirmed,MANUAL_RESEARCH",
    );
    const { rows, errors } = parseHistoricalCsv(text, NOW);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.recordType).toBe(HistoricalRecordType.FEATURE);
    if (row.recordType === HistoricalRecordType.FEATURE) {
      expect(row.fieldKey).toBe("totalFundingRaised");
      expect(row.valueNumeric).toBe(8000000);
      expect(row.effectiveDate).toBe("2023-01-01");
      expect(row.verified).toBe(true);
    }
  });

  it("rejects an unknown field_key rather than importing it silently", () => {
    const text = csv(
      "record_type,startup_name,field_key,value_numeric,effective_date,source_type",
      "FEATURE,Example Health,notARealFeatureKey,5,2023-01-01,ADMIN_ENTERED",
    );
    const { rows, errors } = parseHistoricalCsv(text, NOW);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Unknown field_key/);
  });

  it("rejects an invalid date format", () => {
    const text = csv(
      "record_type,startup_name,field_key,value_numeric,effective_date,source_type",
      "FEATURE,Example Health,teamSize,10,01/01/2023,ADMIN_ENTERED",
    );
    const { errors } = parseHistoricalCsv(text, NOW);
    expect(errors[0].message).toMatch(/Invalid or missing effective_date/);
  });

  it("rejects a future-dated historical claim", () => {
    const text = csv(
      "record_type,startup_name,field_key,value_numeric,effective_date,source_type",
      "FEATURE,Example Health,teamSize,10,2099-01-01,ADMIN_ENTERED",
    );
    const { errors } = parseHistoricalCsv(text, NOW);
    expect(errors[0].message).toMatch(/is in the future/);
  });

  it("rejects an invalid currency code", () => {
    const text = csv(
      "record_type,startup_name,field_key,value_numeric,currency,effective_date,source_type",
      "FEATURE,Example Health,totalFundingRaised,100,dollars,2023-01-01,ADMIN_ENTERED",
    );
    const { errors } = parseHistoricalCsv(text, NOW);
    expect(errors[0].message).toMatch(/Invalid currency code/);
  });

  it("handles a partial row (missing optional columns) correctly", () => {
    const text = csv(
      "record_type,startup_name,field_key,value_numeric,effective_date,source_type",
      "FEATURE,Example Health,teamSize,12,2023-01-01,ADMIN_ENTERED",
    );
    const { rows, errors } = parseHistoricalCsv(text, NOW);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

describe("parseHistoricalCsv — OUTCOME_EVENT and IDENTITY rows", () => {
  it("parses a valid OUTCOME_EVENT row", () => {
    const text = csv(
      "record_type,startup_name,event_type,effective_date,value_numeric,value_text,currency,source_type,source_name,source_url",
      "OUTCOME_EVENT,Example Health,FUNDING_ROUND,2023-08-15,5000000,Series A,SAR,PUBLIC_NEWS_SOURCE,MAGNiTT,https://magnitt.com/x",
    );
    const { rows, errors } = parseHistoricalCsv(text, NOW);
    expect(errors).toEqual([]);
    expect(rows[0].recordType).toBe(HistoricalRecordType.OUTCOME_EVENT);
  });

  it("rejects an unknown event_type", () => {
    const text = csv(
      "record_type,startup_name,event_type,effective_date,source_type",
      "OUTCOME_EVENT,Example Health,NOT_A_REAL_EVENT,2023-08-15,PUBLIC_NEWS_SOURCE",
    );
    const { errors } = parseHistoricalCsv(text, NOW);
    expect(errors[0].message).toMatch(/Unknown event_type/);
  });

  it("parses a valid IDENTITY row", () => {
    const text = csv(
      "record_type,startup_name,startup_domain,external_id,source_name",
      "IDENTITY,Example Health,examplehealth.com,8841,MAGNiTT",
    );
    const { rows, errors } = parseHistoricalCsv(text, NOW);
    expect(errors).toEqual([]);
    expect(rows[0].recordType).toBe(HistoricalRecordType.IDENTITY);
  });

  it("rejects an unknown record_type", () => {
    const text = csv("record_type,startup_name", "NOT_A_TYPE,Example Health");
    const { errors } = parseHistoricalCsv(text, NOW);
    expect(errors[0].message).toMatch(/Missing or unknown record_type/);
  });
});

describe("toOutcomeEventSource / defaultReliability", () => {
  it("collapses the richer source taxonomy onto the 5-value OutcomeEventSource enum", () => {
    expect(toOutcomeEventSource(HistoricalEvidenceSourceType.PUBLIC_NEWS_SOURCE)).toBe(OutcomeEventSource.PUBLIC_SOURCE);
    expect(toOutcomeEventSource(HistoricalEvidenceSourceType.FOUNDER_REPORTED)).toBe(OutcomeEventSource.FOUNDER_REPORTED);
  });

  it("ranks VERIFIED_DOCUMENT as PRIMARY reliability", () => {
    expect(defaultReliability(HistoricalEvidenceSourceType.VERIFIED_DOCUMENT)).toBe(SourceReliability.PRIMARY);
  });

  describe("machine-readable vocabulary (prose is rejected)", () => {
    const outHdr = "record_type,startup_name,event_type,effective_date,value_text,source_type";
    it("accepts MARKET_ENTRY with an exact canonical country", () => {
      const { rows, errors } = parseHistoricalCsv(csv(outHdr, "OUTCOME_EVENT,Example Health,MARKET_ENTRY,2023-12-31,Saudi Arabia,ADMIN_ENTERED"), NOW);
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(1);
    });
    it("rejects MARKET_ENTRY described in prose, in a non-canonical spelling, or left empty", () => {
      for (const v of ['"Opened a Riyadh headquarters, expanding from Egypt"', "KSA", "saudi arabia", "UAE", ""]) {
        const { rows, errors } = parseHistoricalCsv(csv(outHdr, `OUTCOME_EVENT,Example Health,MARKET_ENTRY,2023-12-31,${v},ADMIN_ENTERED`), NOW);
        expect(rows).toHaveLength(0);
        expect(errors[0].message).toMatch(/MARKET_ENTRY value_text .* canonical destination country/);
      }
    });
    it("accepts a regulatory event only when value_text is an exact ladder stage (any pathway, case-insensitive)", () => {
      for (const v of ["approval", "SFDA authorization", "Phase II", "ISO 13485"]) {
        const { errors } = parseHistoricalCsv(csv(outHdr, `OUTCOME_EVENT,Example Health,REGULATORY_APPROVAL,2021-10-31,${v},ADMIN_ENTERED`), NOW);
        expect(errors).toEqual([]);
      }
    });
    it("rejects a regulatory event described in prose or with an invented stage", () => {
      for (const v of ['"SFDA approval for the RT-PCR test kit"', "Approved", "SFDA approval", ""]) {
        const { rows, errors } = parseHistoricalCsv(csv(outHdr, `OUTCOME_EVENT,Example Health,REGULATORY_MILESTONE,2021-10-31,${v},ADMIN_ENTERED`), NOW);
        expect(rows).toHaveLength(0);
        expect(errors[0].message).toMatch(/not a regulatory ladder value/);
      }
    });
    it("applies the same ladder rule to a regulatoryMilestone FEATURE row", () => {
      const hdr = "record_type,startup_name,field_key,value_text,effective_date,source_type";
      expect(parseHistoricalCsv(csv(hdr, "FEATURE,Example Health,regulatoryMilestone,QMS,2022-12-31,ADMIN_ENTERED"), NOW).errors).toEqual([]);
      const bad = parseHistoricalCsv(csv(hdr, '"FEATURE",Example Health,regulatoryMilestone,"in discussions with the regulator",2022-12-31,ADMIN_ENTERED'), NOW);
      expect(bad.rows).toHaveLength(0);
      expect(bad.errors[0].message).toMatch(/regulatoryMilestone value_text/);
    });
    it("does not constrain value_text on other event types (e.g. FUNDING_ROUND descriptions stay free text)", () => {
      const { errors } = parseHistoricalCsv(csv(outHdr, 'OUTCOME_EVENT,Example Health,FUNDING_ROUND,2022-05-01,"Seed round led by an investor",ADMIN_ENTERED'), NOW);
      expect(errors).toEqual([]);
    });
  });
});
