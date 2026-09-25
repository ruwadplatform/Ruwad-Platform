import { formatSarMillions } from "../report-stats.service";
import { numbersIn } from "./library-verify";
import type { LibraryDefinition, LibraryMetric, LibraryParagraph, LibrarySection, VerifiedFact, WorldBankPoint } from "./library-types";
import type { LibraryRaw } from "./library-stats.service";

export interface NarrativeInput { def: LibraryDefinition; raw: LibraryRaw; facts: VerifiedFact[]; worldBank: WorldBankPoint[] }
export interface NarrativeOutput { sections: LibrarySection[]; missing: string[]; warnings: string[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const top = (rows: { l: string; v: number }[]) => rows[0];

/** Assembles a report's sections. It writes RUWĀD's own connecting analysis, but every number in any paragraph must come from
 * a verified fact, a live World Bank value or a database figure passed in explicitly — otherwise the paragraph is dropped and a
 * warning is recorded. Analysis never introduces a figure, forecast or market size of its own. */
export function buildNarrative({ def, raw, facts, worldBank }: NarrativeInput): NarrativeOutput {
  const factMap = new Map(facts.map((f) => [f.id, f]));
  const wbMap = new Map(worldBank.map((p) => [p.id, p]));
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const id of def.factIds) if (!factMap.has(id)) missing.push(`A supporting source (${id}) could not be verified when this report was generated and was left out.`);
  for (const id of def.worldBankIds) if (!wbMap.has(id)) missing.push(`World Bank indicator ${id} could not be retrieved when this report was generated and was left out.`);

  /** A paragraph whose numbers are checked against the evidence it cites. */
  const para = (text: string, o: { facts?: string[]; wb?: string[]; db?: (string | number)[] } = {}): LibraryParagraph | null => {
    const allowed = new Set<string>();
    for (const id of o.facts ?? []) { const f = factMap.get(id); if (f) numbersIn([f.statement, f.quote, String(f.year), f.period ?? "", f.publishedOn ?? ""].join(" ")).forEach((n) => allowed.add(n)); }
    for (const id of o.wb ?? []) { const p = wbMap.get(id); if (p) numbersIn(`${p.display} ${p.year} ${p.unit}`).forEach((n) => allowed.add(n)); }
    numbersIn((o.db ?? []).join(" ")).forEach((n) => allowed.add(n));
    const bad = numbersIn(text).filter((n) => !allowed.has(n));
    if (bad.length) { warnings.push(`Dropped a paragraph with unsupported number(s) ${bad.join(", ")}: "${text.slice(0, 80)}"`); return null; }
    return { text, factIds: [...(o.facts ?? []), ...(o.wb ?? [])] };
  };
  const factParas = (...ids: string[]) => ids.filter((id) => factMap.has(id)).map((id) => ({ text: factMap.get(id)!.statement, factIds: [id] }));
  const section = (heading: string, paragraphs: (LibraryParagraph | null)[], extra: Partial<LibrarySection> = {}): LibrarySection => ({ heading, paragraphs: paragraphs.filter((p): p is LibraryParagraph => p !== null), ...extra });
  const wbMetrics = (...ids: string[]): LibraryMetric[] => ids.filter((id) => wbMap.has(id)).map((id) => { const p = wbMap.get(id)!; return { label: `${p.label} (${p.unit})`, value: p.display, note: `World Bank, ${p.year}` }; });

  const systemParas = (): (LibraryParagraph | null)[] => {
    const out: (LibraryParagraph | null)[] = [];
    const exp = wbMap.get("wb-health-exp-gdp"); const pc = wbMap.get("wb-health-exp-pc"); const pop = wbMap.get("wb-population"); const life = wbMap.get("wb-life-expectancy");
    if (exp) out.push(para(`World Bank data put Saudi Arabia's current health expenditure at ${exp.display}% of GDP in ${exp.year}${pc ? `, or US$ ${pc.display} per person in ${pc.year}` : ""}.`, { wb: ["wb-health-exp-gdp", ...(pc ? ["wb-health-exp-pc"] : [])] }));
    if (pop && life) out.push(para(`The same source records a population of ${pop.display} in ${pop.year} and a life expectancy at birth of ${life.display} years in ${life.year}.`, { wb: ["wb-population", "wb-life-expectancy"] }));
    return out;
  };
  const capacityParas = (): (LibraryParagraph | null)[] => {
    const ph = wbMap.get("wb-physicians"); const nu = wbMap.get("wb-nurses"); const be = wbMap.get("wb-beds");
    const bits = [ph && `${ph.display} physicians per 1,000 people (${ph.year})`, nu && `${nu.display} nurses and midwives per 1,000 people (${nu.year})`, be && `${be.display} hospital beds per 1,000 people (${be.year})`].filter(Boolean);
    return bits.length ? [para(`World Bank indicators for Saudi Arabia show ${bits.join(", ")}.`, { wb: ["wb-physicians", "wb-nurses", "wb-beds"] })] : [];
  };

  const directoryLine = (): LibraryParagraph | null => {
    const parts = [raw.startupsTotal && plural(raw.startupsTotal, "startup"), raw.investorsTotal && plural(raw.investorsTotal, "investor"), raw.hubs && plural(raw.hubs, "hub or enabler", "hubs and enablers"),
      raw.researchInstitutions && plural(raw.researchInstitutions, "research institution"), raw.multinationals && plural(raw.multinationals, "multinational")].filter(Boolean);
    if (!parts.length) return para("The RUWĀD directory does not yet contain published entries, so this report has no platform statistics to draw on.");
    return para(`The RUWĀD directory currently lists ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}. RUWĀD is a curated directory and does not cover every organization in the Saudi healthcare ecosystem, so these counts describe RUWĀD's coverage, not the size of the sector.`, { db: [raw.startupsTotal, raw.investorsTotal, raw.hubs, raw.researchInstitutions, raw.multinationals] });
  };

  const label = def.sector;
  const groupParas = (): (LibraryParagraph | null)[] => {
    const scopeText = def.categories ? `the ${label} sector group (${def.categories.join(", ")})` : "all sectors";
    if (raw.startups === 0) {
      return [para(`RUWĀD does not currently list any startups in ${scopeText}. This report therefore makes no claim about company-level activity in the sector; it relies on the regulator and Ministry sources below and will reflect company data as profiles are added to RUWĀD.`)];
    }
    const out: (LibraryParagraph | null)[] = [];
    const stage = top([...raw.stages].sort((a, b) => b.v - a.v));
    out.push(para(`RUWĀD lists ${plural(raw.startups, "startup")} in ${scopeText}${stage ? `; the most common stage is ${stage.l} (${stage.v})` : ""}. ${raw.funded ? `${raw.funded} of them ${raw.funded === 1 ? "has" : "have"} recorded funding, totalling ${formatSarMillions(raw.fundingSarM)} (a sum of company-reported funding, not a market total)` : "None has recorded funding yet"}${raw.fundraising ? `, and ${raw.fundraising} ${raw.fundraising === 1 ? "is" : "are"} marked as currently fundraising` : ""}.`,
      { db: [raw.startups, stage?.v ?? "", raw.funded, formatSarMillions(raw.fundingSarM), raw.fundraising] }));
    if (raw.investorsWithGroupDeals > 0) out.push(para(`${raw.investorsWithGroupDeals} of ${raw.investorsTotal} investors on RUWĀD have a recorded investment in a company ${def.categories ? "in this group" : "listed on RUWĀD"}.`, { db: [raw.investorsWithGroupDeals, raw.investorsTotal] }));
    return out;
  };

  const researchParas = (): (LibraryParagraph | null)[] => {
    if (!raw.researchInstitutions) return [];
    const bits = [raw.researchers && `${raw.researchers.toLocaleString("en-US")} researchers`, raw.researchCenters && plural(raw.researchCenters, "research center"), raw.researchLabs && plural(raw.researchLabs, "laboratory", "laboratories"), raw.patents && plural(raw.patents, "patent")].filter(Boolean);
    return [para(`The ${plural(raw.researchInstitutions, "research institution")} on RUWĀD report ${bits.join(", ")} between them, as entered on their profiles.`, { db: [raw.researchInstitutions, raw.researchers, raw.researchCenters, raw.researchLabs, raw.patents] })];
  };

  const reading = (text: string) => para(text);
  const sections: LibrarySection[] = [];
  const gapNote = (...lines: string[]) => lines;

  switch (def.slug) {
    case "saudi-healthcare-ecosystem-overview-2026": {
      sections.push(section("Executive summary", [
        reading("This overview describes the Saudi healthcare ecosystem from three angles: national system indicators, the government's transformation and investment announcements, and the organizations mapped on the RUWĀD platform. Statistics about the RUWĀD directory are calculated directly from the RUWĀD database; every external figure is attributed to its source, year and geography."),
        reading("RUWĀD does not estimate market size. Where a government body publishes a projection, it is shown as that body's projection."),
      ]));
      sections.push(section("The health system at a glance", [...systemParas(), ...capacityParas()], { metrics: wbMetrics("wb-health-exp-gdp", "wb-health-exp-pc", "wb-population", "wb-life-expectancy", "wb-physicians", "wb-nurses", "wb-beds") }));
      sections.push(section("Transformation and the health cluster model", [
        ...factParas("hstp-objectives", "hh-second-phase", "hh-total-transfer"),
        reading("Moving public providers into health clusters under Health Holding changes who buys from, partners with and pilots with innovators. For startups and suppliers, the cluster is increasingly the counterparty rather than a single hospital."),
        ...factParas("moh-gdp-projection"),
      ]));
      sections.push(section("Investment signals", [
        ...factParas("ghe2025-total", "ghe2025-hospitals", "ghe2025-vc", "ghe2024-investments"),
        reading("These are announcements and commitments reported by the Ministry of Health around its annual exhibition, not audited spending. They show where capital and partnerships are being directed, and they should not be read as deployed investment."),
      ]));
      sections.push(section("The RUWĀD-mapped ecosystem", [directoryLine(), ...groupParas(), ...researchParas()], { distributionKeys: ["stage", "investorType", "hubType", "researchType"] }));
      sections.push(section("Regulation and innovation pathways", factParas("sfda-ecosystem", "sfda-software-licensing")));
      break;
    }
    case "saudi-digital-health-landscape-2026": {
      sections.push(section("Overview", [
        reading("Digital health in Saudi Arabia sits at the meeting point of national platforms run by the Ministry of Health, a regulator that treats many software products as medical devices, and a growing set of private companies. This report sets out the regulatory framework and public platforms using official sources, and shows the digital health companies and investors currently mapped on RUWĀD."),
        para("RUWĀD does not publish a digital health market size. None was found in a source that could be verified.", {}),
      ]));
      sections.push(section("Regulatory framework for digital health software", [
        ...factParas("sfda-dh-uses", "sfda-samd", "sfda-ivd-route", "sfda-wellness", "sfda-ai-ml"),
        reading("In practice, the first question for a digital health founder is qualification: whether the product is a regulated medical device (including software and AI/ML functions) or a general wellness product with restricted claims. The answer determines the SFDA pathway, the evidence required and the labeling."),
      ]));
      sections.push(section("Licensing and authorizations", factParas("sfda-software-licensing", "sfda-ai-authorization")));
      sections.push(section("National platforms and virtual care", [
        ...factParas("sehhaty", "hstp-virtual", "hstp-yusur", "moh-opportunities-2040"),
        reading("The sources above describe services and platforms rather than usage figures. RUWĀD has not reported adoption numbers because none were verified from an official page."),
      ]));
      sections.push(section("Digital health companies on RUWĀD", [...groupParas()], { distributionKeys: ["stage", "city", "fundingByStage"] }));
      break;
    }
    case "saudi-biotechnology-landscape-2026": {
      sections.push(section("Overview", [
        reading("Biotechnology is one of the sectors the Kingdom has singled out for national strategy. This report summarizes the National Biotechnology Strategy, investment and localization announcements, and the biotechnology companies and research institutions mapped on RUWĀD."),
        reading("RUWĀD does not publish a biotechnology market size. None was found in a source that could be verified."),
      ]));
      sections.push(section("National Biotechnology Strategy", [...factParas("biotech-strategy", "biotech-pillars", "biotech-biosimilars", "biotech-jobs")]));
      sections.push(section("Investment and localization signals", [
        ...factParas("ghe2025-lifesciences", "ghe2025-biotechfund", "moh-opportunities-2040", "biotech-bio2025"),
        reading("The figures above are announcements reported by the Ministry of Health. They indicate where localization interest is concentrated; they are not a measure of the size of the Saudi biotechnology industry."),
      ]));
      sections.push(section("Research and development context", [
        wbMap.get("wb-rd") ? para(`World Bank data show research and development expenditure of ${wbMap.get("wb-rd")!.display}% of GDP in ${wbMap.get("wb-rd")!.year}. This is an economy-wide indicator, not a biotechnology figure.`, { wb: ["wb-rd"] }) : null,
        ...researchParas(),
      ], { metrics: wbMetrics("wb-rd"), distributionKeys: ["researchType"] }));
      sections.push(section("Biotechnology companies on RUWĀD", groupParas(), { distributionKeys: ["stage", "city"] }));
      break;
    }
    case "saudi-medtech-landscape-2026": {
      sections.push(section("Overview", [
        reading("Medical devices, diagnostics and medical software are regulated by the SFDA, while localization and manufacturing partnerships are announced through the Ministry of Health. This report summarizes both, using official sources, and shows the MedTech companies mapped on RUWĀD."),
        reading("RUWĀD does not publish a MedTech market size. None was found in a source that could be verified."),
      ]));
      sections.push(section("Device and software regulation", [
        ...factParas("sfda-samd", "sfda-ivd-route", "sfda-software-licensing"),
        reading("Because SFDA's guidance defines software by its medical purpose, digital MedTech founders face qualification and authorization questions similar to those facing hardware makers. The SFDA's own description of its innovation ecosystem also points to data governance and to frameworks for AI and cybersecurity."),
      ]));
      sections.push(section("Authorizations and the innovation pathway", factParas("sfda-ai-authorization", "sfda-ecosystem")));
      sections.push(section("Localization signals", [
        ...factParas("ghe2025-lifesciences"),
        reading("A commitment to localize medical technologies is an announcement of intent. RUWĀD has not verified production, capacity or import-substitution figures and does not report them."),
      ]));
      sections.push(section("MedTech companies on RUWĀD", [...groupParas(), raw.multinationals ? para(`Among the ${plural(raw.multinationals, "multinational")} on RUWĀD, ${raw.mncManufacturing} ${raw.mncManufacturing === 1 ? "reports" : "report"} manufacturing in the Kingdom and ${raw.mncSaudiOffice} ${raw.mncSaudiOffice === 1 ? "has" : "have"} a Saudi office (all sectors).`, { db: [raw.multinationals, raw.mncManufacturing, raw.mncSaudiOffice] }) : null], { distributionKeys: ["stage", "mncCategory"] }));
      break;
    }
    case "saudi-healthcare-startup-funding-landscape-2026": {
      sections.push(section("Overview", [
        reading("This report separates two kinds of evidence. Public sources describe venture funding across the whole Saudi economy and healthcare investment announcements; RUWĀD's own records describe the funding reported by the companies and investors it lists. The two are not added together."),
        reading("RUWĀD does not estimate the size of the healthcare startup funding market."),
      ]));
      sections.push(section("Venture funding signals", [
        ...factParas("monshaat-vc-h1-2025", "monshaat-mena-share", "monshaat-riyadh-rank"),
        reading("These Monsha'at figures cover all sectors. They provide context for the funding environment but are not a healthcare-only measure."),
      ]));
      sections.push(section("Healthcare investment announcements", [
        ...factParas("ghe2025-vc", "ghe2025-biotechfund", "ghe2024-investments"),
        reading("Ministry of Health figures are commitments announced around the Global Health Exhibition, and the funds named are a subset of the venture capital available to healthcare companies."),
      ]));
      sections.push(section("Funding recorded on RUWĀD", [...groupParas(), raw.rounds ? para(`${plural(raw.rounds, "individual funding round")} ${raw.rounds === 1 ? "is" : "are"} recorded on RUWĀD company profiles.`, { db: [raw.rounds] }) : null,
        raw.funded ? para(`Median recorded funding is ${formatSarMillions(raw.medianFundingSarM)} per funded company.`, { db: [formatSarMillions(raw.medianFundingSarM)] }) : null], { distributionKeys: ["stage", "fundingByStage", "city"] }));
      sections.push(section("Investors on RUWĀD", [
        raw.investorsTotal ? para(`RUWĀD lists ${plural(raw.investorsTotal, "investor")}${top(raw.investorTypes) ? `; the most common type is ${top(raw.investorTypes).l} (${top(raw.investorTypes).v})` : ""}. ${raw.investorsWithGroupDeals} ${raw.investorsWithGroupDeals === 1 ? "has" : "have"} a recorded investment in a RUWĀD-listed startup${raw.investorHealthDeals ? `, and investors report ${raw.investorHealthDeals} healthcare deals between them` : ""}.`, { db: [raw.investorsTotal, top(raw.investorTypes)?.v ?? "", raw.investorsWithGroupDeals, raw.investorHealthDeals] }) : null,
      ], { distributionKeys: ["investorType"] }));
      break;
    }
    case "saudi-healthcare-infrastructure-workforce-2026": {
      sections.push(section("Overview", [
        reading("Capacity and workforce determine how much innovation the health system can absorb. This report uses World Bank indicators for national capacity, government sources for the organization of public providers, and RUWĀD's own directory of hubs and research institutions."),
        reading("RUWĀD holds no facility-level or workforce data of its own, and no official facility count or workforce breakdown could be verified, so none is reported."),
      ]));
      sections.push(section("Capacity and workforce indicators", capacityParas(), { metrics: wbMetrics("wb-population", "wb-physicians", "wb-nurses", "wb-beds") }));
      sections.push(section("New capacity announced", [
        ...factParas("ghe2025-hospitals", "ghe2025-alhayat"),
        reading("These are project announcements made at an exhibition. RUWĀD has not verified construction status or opening dates."),
      ]));
      sections.push(section("Health clusters and the public workforce", [
        ...factParas("hstp-objectives", "hh-second-phase", "hh-total-transfer"),
        reading("Transferring employees into health clusters changes how the public workforce is employed and managed, which matters for anyone planning workforce-dependent products or services."),
      ]));
      sections.push(section("Hubs and research institutions on RUWĀD", [
        raw.hubs ? para(`RUWĀD lists ${plural(raw.hubs, "hub or enabler", "hubs and enablers")}${top(raw.hubCities) ? `; the most common location is ${top(raw.hubCities).l} (${top(raw.hubCities).v})` : ""}.`, { db: [raw.hubs, top(raw.hubCities)?.v ?? ""] }) : null,
        ...researchParas(),
      ], { distributionKeys: ["hubType", "hubCity", "researchType", "researchCity"] }));
      break;
    }
  }

  const gapsBySlug: Record<string, string[]> = {
    "saudi-healthcare-ecosystem-overview-2026": gapNote("A healthcare market-size figure from a credible source was not identified.", "A cluster-by-cluster breakdown of capacity and services was not verified from an official page."),
    "saudi-digital-health-landscape-2026": gapNote("Usage and adoption figures for national digital health platforms were not verified from an official page.", "A digital health market-size figure from a credible source was not identified."),
    "saudi-biotechnology-landscape-2026": gapNote("A biotechnology market-size figure from a credible source was not identified.", "Company-level data on Saudi biotechnology firms beyond those listed on RUWĀD was not verified."),
    "saudi-medtech-landscape-2026": gapNote("A medical device market-size figure from a credible source was not identified.", "Device import, localization and production statistics were not verified from an official page."),
    "saudi-healthcare-startup-funding-landscape-2026": gapNote("Healthcare-only venture funding totals from a credible source were not identified.", "PIF and Sanabil healthcare-specific investment figures could not be verified from pages that publish readable text, so none are reported."),
    "saudi-healthcare-infrastructure-workforce-2026": gapNote("National facility counts and workforce breakdowns by specialty or nationality were not verified from an official page.", "RUWĀD does not hold facility or workforce data."),
  };
  missing.push(...(gapsBySlug[def.slug] ?? []));
  return { sections: sections.filter((s) => s.paragraphs.length || s.metrics?.length), missing, warnings };
}
