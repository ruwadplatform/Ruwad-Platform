import type { Report } from "../report.entity";
import type { ExternalSource, InternalStats } from "../report-types";
import { MARKET_SIZE_NOT_IDENTIFIED, type LibraryContent, type LibraryDefinition, type LibrarySection, type VerifiedFact, type WorldBankPoint } from "./library-types";

export const LIBRARY_METHODOLOGY = [
  "RUWĀD statistics are calculated directly from the RUWĀD platform database at the time of generation. RUWĀD is a curated directory, so its counts describe RUWĀD's coverage and not the size of the Saudi healthcare sector.",
  "External facts come from government bodies, regulators, official programs and international organizations. Each fact is stored with its source organization, document title, year, geography and web address, together with the exact wording taken from the source.",
  "At generation, RUWĀD looks the quoted wording up on the source page again. A fact whose wording can no longer be found is left out. Where a source page cannot be reached from the server, the fact is kept and labelled with the date an analyst last read it on the live page.",
  "World Bank indicators are retrieved live from the World Bank API for Saudi Arabia, and each shows the year the value refers to.",
  "The analysis connecting these facts is written by RUWĀD. It contains no figure that is not in a cited source or calculated from the RUWĀD database, and no forecast or market-size estimate of RUWĀD's own.",
  "Further-reading links were found with RUWĀD's shared web search. They are shown for context only and no figure in this report is taken from them.",
  "This report was assembled without an AI model, and viewing it does not run new searches.",
];

const words = (s: LibrarySection[]) => s.reduce((n, sec) => n + sec.paragraphs.reduce((m, p) => m + p.text.split(/\s+/).length, 0), 0);

/** Maps a library report onto the standard `reports` columns, so it lists, searches and opens like any other report. */
export function assembleReport(def: LibraryDefinition, content: LibraryContent, stats: InternalStats, researchQueries: Report["researchQueries"], today: string): Partial<Report> {
  const intro = content.sections[0]?.paragraphs.map((p) => p.text).join(" ") ?? def.description;
  const findings = content.sections.flatMap((s) => s.paragraphs).filter((p) => p.factIds.length > 0).map((p) => p.text).slice(0, 6);
  const metrics = [...content.sections.flatMap((s) => s.metrics ?? []), ...stats.metrics].slice(0, 6).map((m) => ({ label: m.label, value: m.value }));
  const allLive = content.facts.length > 0 && content.facts.every((f) => f.verification === "live");
  return {
    slug: def.slug, title: def.title, category: def.category, reportType: "RUWĀD Research Report", publicationDate: today, description: def.description,
    geography: "Saudi Arabia", sector: def.sector, authors: ["RUWĀD Research"], badges: ["Ruwād Research"],
    readingTime: `${Math.max(3, Math.ceil(words(content.sections) / 200))} min read`, pages: content.sections.length,
    executiveSummary: intro, keyFindings: findings, marketStats: metrics,
    sections: content.sections.map((s) => ({ heading: s.heading, body: s.paragraphs.map((p) => p.text).join("\n\n") })),
    sources: [
      ...content.facts.map((f: VerifiedFact) => `${f.organization} — ${f.documentTitle} (${f.year})`),
      ...content.worldBank.map((p: WorldBankPoint) => `World Bank — ${p.label} (${p.year})`),
    ],
    provenanceConfidence: allLive && content.worldBank.length > 0 ? "High" : "Medium", provenanceLastUpdated: today,
    provenanceSources: [...new Set([...content.facts.map((f) => f.organization), ...(content.worldBank.length ? ["World Bank"] : []), "RUWĀD platform database"])],
    reportKind: null, scope: { sector: def.sector }, internalStats: stats, externalSources: content.furtherReading, researchQueries, researchedAt: new Date(),
    generationMode: "no-ai", generated: null, aiOverview: null, origin: "RUWAD", libraryContent: content,
  };
}

export function emptyContent(furtherReading: ExternalSource[], now = new Date()): Pick<LibraryContent, "version" | "marketSize" | "furtherReading" | "methodology" | "generatedAt"> {
  return { version: 1, marketSize: { status: "notIdentified", message: MARKET_SIZE_NOT_IDENTIFIED }, furtherReading, methodology: LIBRARY_METHODOLOGY, generatedAt: now.toISOString() };
}
