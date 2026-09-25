import type { ExternalSource } from "../report-types";

export type FactSourceType = "Government" | "Regulator" | "International organization" | "Official program";

/** One externally sourced statement. `quote` is copied word for word from the source page; `statement` is RUWĀD's own wording.
 * Every number in `statement` must appear in `quote`, `period` or `year` (enforced by tests and again at generation). */
export interface LibraryFact {
  id: string;
  organization: string;
  sourceType: FactSourceType;
  documentTitle: string;
  url: string;
  geography: string;
  year: number;
  /** The exact day or period the source states, when it does (e.g. "H1 2025"). */
  period?: string;
  publishedOn?: string;
  statement: string;
  quote: string;
  /** Day a RUWĀD analyst last read the quote on the live page. */
  verifiedOn: string;
  quantitative: boolean;
}

export type FactVerification = "live" | "manual";

/** A fact as stored on a report: the registry entry plus how it was checked at generation. */
export interface VerifiedFact extends LibraryFact {
  verification: FactVerification;
  checkedAt: string;
}

/** A live World Bank data point (value, year, geography and link come from the World Bank API at generation time). */
export interface WorldBankPoint {
  id: string;
  code: string;
  label: string;
  unit: string;
  value: number;
  display: string;
  year: number;
  geography: string;
  organization: "World Bank";
  url: string;
  retrievedAt: string;
}

export interface LibraryMetric { label: string; value: string; note?: string }

export interface LibraryParagraph {
  text: string;
  /** Registry fact ids or World Bank ids that support this paragraph. */
  factIds: string[];
}

export interface LibrarySection {
  heading: string;
  paragraphs: LibraryParagraph[];
  metrics?: LibraryMetric[];
  /** Keys of `internalStats.distributions` to draw under this section. */
  distributionKeys?: string[];
  /** Plain "not available" statements for this section. */
  gaps?: string[];
}

export interface LibraryContent {
  version: 1;
  facts: VerifiedFact[];
  worldBank: WorldBankPoint[];
  sections: LibrarySection[];
  /** What RUWĀD could not verify or does not hold, listed openly. */
  missing: string[];
  marketSize: { status: "notIdentified"; message: string };
  /** Sources found through the shared Serper research for further reading. They carry no figures used in this report. */
  furtherReading: ExternalSource[];
  methodology: string[];
  generatedAt: string;
}

export interface LibraryDefinition {
  slug: string;
  title: string;
  category: string;
  sector: string;
  description: string;
  /** RUWĀD startup categories that make up this report's sector group (null = all sectors). */
  categories: string[] | null;
  /** Serper topic used to find further reading. */
  researchTopic: string;
  factIds: string[];
  worldBankIds: string[];
}

export const MARKET_SIZE_NOT_IDENTIFIED = "Reliable market-size data was not identified from the available sources.";
