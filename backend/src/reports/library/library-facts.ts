import type { LibraryFact } from "./library-types";

/** The curated evidence behind the default RUWĀD library. Each entry was read on the live source page by a RUWĀD analyst on
 * `verifiedOn`; `quote` is copied word for word, `statement` is RUWĀD's own wording. At generation the quote is looked up on the
 * page again, and a fact whose quote is no longer there is dropped. Add a fact only with a verbatim quote from a page you have read.
 * Nothing here is an estimate, and no market size is stated (see MARKET_SIZE_NOT_IDENTIFIED). */
const VERIFIED_ON = "2026-09-24";
const MOH = "Saudi Ministry of Health";
const V2030_BIO = "Saudi Vision 2030 – National Biotechnology Strategy";
const SFDA = "Saudi Food and Drug Authority (SFDA)";
const V2030 = "Saudi Vision 2030 – Health Sector Transformation Program";
const MONSHAAT = "Monsha'at (Small and Medium Enterprises General Authority)";
const GHE = "https://www.moh.gov.sa/en/ministry/mediacenter/news/pages/news-2025-10-29-008.aspx";
const GHE_TITLE = "GHE 2025 Continues With Over $33 Billion In Strategic Health Investments";
const SME_MONITOR = "https://www.monshaat.gov.sa/sites/default/files/2025-09/V5.0%20Monsha%27at%20SMEM%20Report%20-%20Q2-25.pdf";
const BIOTECH_MOH = "https://www.moh.gov.sa/en/ministry/mediacenter/news/pages/news-2025-07-15-001.aspx";
const G027 = "https://sfda.gov.sa/sites/default/files/2026-08/MDS-G027_0.pdf";
const HH = "https://www.moh.gov.sa/en/ministry/mediacenter/news/pages/news-2026-06-25-001.aspx";

const f = (x: Omit<LibraryFact, "verifiedOn" | "geography"> & { geography?: string }): LibraryFact => ({ geography: "Saudi Arabia", verifiedOn: VERIFIED_ON, ...x });

export const LIBRARY_FACTS: LibraryFact[] = [
  // ---- Global Health Exhibition 2025 (Ministry of Health) ----
  f({ id: "ghe2025-total", organization: MOH, sourceType: "Government", documentTitle: `MOH News – ${GHE_TITLE}`, url: GHE, year: 2025, publishedOn: "2025-10-29", quantitative: true,
    statement: "The Ministry of Health reported that the 2025 Global Health Exhibition continued with more than USD 33 billion in strategic health investments.",
    quote: GHE_TITLE }),
  f({ id: "ghe2025-hospitals", organization: MOH, sourceType: "Government", documentTitle: `MOH News – ${GHE_TITLE}`, url: GHE, year: 2025, publishedOn: "2025-10-29", quantitative: true,
    statement: "At the 2025 Global Health Exhibition, USD 8.4 billion in new hospital and infrastructure development projects was announced.",
    quote: "unveiling USD 8.4 billion in new hospital and infrastructure development projects" }),
  f({ id: "ghe2025-alhayat", organization: MOH, sourceType: "Government", documentTitle: `MOH News – ${GHE_TITLE}`, url: GHE, year: 2025, publishedOn: "2025-10-29", quantitative: true,
    statement: "One announced project is the expansion of Al Hayat National Hospitals to 15 facilities with 4,000 beds (USD 1.86 billion).",
    quote: "Al Hayat National Hospitals' expansion to 15 facilities with 4,000 beds (USD 1.86B)" }),
  f({ id: "ghe2025-lifesciences", organization: MOH, sourceType: "Government", documentTitle: `MOH News – ${GHE_TITLE}`, url: GHE, year: 2025, publishedOn: "2025-10-29", quantitative: true,
    statement: "The life sciences sector saw investments of over USD 625 million at the 2025 Global Health Exhibition, including a USD 266 million commitment by BD to localize medical technologies and a USD 20 million partnership between Roche and the Ministry of Health to strengthen clinical research.",
    quote: "The life sciences sector saw investments of over USD 625M, including BD's USD 266M commitment to localize medical technologies, and Roche's USD 20M partnership with the Ministry of Health to enhance clinical research capabilities." }),
  f({ id: "ghe2025-vc", organization: MOH, sourceType: "Government", documentTitle: `MOH News – ${GHE_TITLE}`, url: GHE, year: 2025, publishedOn: "2025-10-29", quantitative: true,
    statement: "The Ministry stated that USD 3.24 billion has been committed to venture capital and strategic funds aimed at accelerating innovation and localization.",
    quote: "USD 3.24B committed to venture capital and strategic funds aimed at accelerating innovation and localization" }),
  f({ id: "ghe2025-biotechfund", organization: MOH, sourceType: "Government", documentTitle: `MOH News – ${GHE_TITLE}`, url: GHE, year: 2025, publishedOn: "2025-10-29", quantitative: true,
    statement: "Goldtrack Ventures launched what the Ministry describes as the first Saudi industrial biotech growth fund, worth USD 250 million.",
    quote: "Goldtrack Ventures launched the first Saudi industrial biotech growth fund worth USD 250M" }),

  // ---- Ministry of Health projections and earlier editions ----
  f({ id: "moh-gdp-projection", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Health Ministry to Launch Biotech and Pharma Partnerships at GHE 2025",
    url: "https://www.moh.gov.sa/en/ministry/mediacenter/news/pages/news-2025-10-08-001.aspx", year: 2025, publishedOn: "2025-10-08", quantitative: true,
    statement: "The Ministry projects the health sector's contribution to national GDP rising from SAR 199 billion in 2020 to SAR 318 billion by 2030. This is an official projection, not a RUWĀD estimate.",
    quote: "The sector's contribution to the national GDP is projected to soar from SAR 199 billion in 2020 to SAR 318 billion by 2030" }),
  f({ id: "moh-opportunities-2040", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Health Ministry to Launch Biotech and Pharma Partnerships at GHE 2025",
    url: "https://www.moh.gov.sa/en/ministry/mediacenter/news/pages/news-2025-10-08-001.aspx", year: 2025, publishedOn: "2025-10-08", quantitative: true,
    statement: "The Ministry links biotechnology, vaccine production, medical manufacturing, research and digital health to opportunities it values at over SAR 130 billion by 2040.",
    quote: "With a focus on biotechnology, vaccine production, medical manufacturing, research, and digital health, Saudi Arabia is unlocking opportunities valued at over SAR 130 billion by 2040" }),
  f({ id: "ghe2024-investments", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Health Ministry to Launch Biotech and Pharma Partnerships at GHE 2025",
    url: "https://www.moh.gov.sa/en/ministry/mediacenter/news/pages/news-2025-10-08-001.aspx", year: 2025, publishedOn: "2025-10-08", period: "2024 edition", quantitative: true,
    statement: "The Ministry stated that the 2024 edition of the Global Health Exhibition alone witnessed investments exceeding SAR 50 billion.",
    quote: "The 2024 edition alone witnessed investments exceeding SAR 50 billion" }),

  // ---- Health Holding and the health clusters ----
  f({ id: "hh-total-transfer", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Health Holding Completes Staff Transfer to Seven Health Clusters", url: HH, year: 2026, publishedOn: "2026-06-25", quantitative: true,
    statement: "Health Holding reported that, across both transfer phases, more than 130,000 employees have been included in 10 health clusters.",
    quote: "bringing the total number of employees included across both phases to more than 130,000 in 10 health clusters" }),
  f({ id: "hh-second-phase", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Health Holding Completes Staff Transfer to Seven Health Clusters", url: HH, year: 2026, publishedOn: "2026-06-25", quantitative: true,
    statement: "The second transfer phase covered more than 68,000 healthcare and administrative employees.",
    quote: "The process covered more than 68,000 healthcare and administrative employees." }),

  // ---- Health Sector Transformation Program ----
  f({ id: "hstp-objectives", organization: V2030, sourceType: "Official program", documentTitle: "Health Sector Transformation Report 2024",
    url: "https://www.vision2030.gov.sa/media/h0yb5d03/health-sector-transformation-report-2024.pdf", year: 2024, quantitative: true,
    statement: "The Health Sector Transformation Program's 2024 report describes entities across the healthcare sector working toward 4 strategic objectives and a suite of executive initiatives.",
    quote: "all working towards achieving 4 strategic objectives and a suite of executive initiatives" }),
  f({ id: "hstp-virtual", organization: V2030, sourceType: "Official program", documentTitle: "Health Sector Transformation Report 2024",
    url: "https://www.vision2030.gov.sa/media/h0yb5d03/health-sector-transformation-report-2024.pdf", year: 2024, quantitative: false,
    statement: "The 2024 program report describes virtual healthcare services at Ministry of National Guard facilities that let beneficiaries reach health services without visiting the hospital.",
    quote: "Virtual healthcare services provided at healthcare facilities of the Ministry of National Guard contribute to facilitating beneficiaries' access to health services from any place, without the need for visiting the hospital" }),
  f({ id: "hstp-yusur", organization: V2030, sourceType: "Official program", documentTitle: "Health Sector Transformation Report 2024",
    url: "https://www.vision2030.gov.sa/media/h0yb5d03/health-sector-transformation-report-2024.pdf", year: 2024, quantitative: false,
    statement: "The report describes the Yusur service, an integrated platform through which beneficiaries request prescriptions to be prepared and delivered by a network of healthcare providers and delivery companies.",
    quote: "beneficiaries can request their prescriptions to be prepared and delivered via an integrated platform encompassing a wide network of healthcare provider and express delivery companies" }),
  f({ id: "sehhaty", organization: MOH, sourceType: "Government", documentTitle: "«Sehhaty» Platform", url: "https://www.moh.gov.sa/en/eservices/sehhaty/pages/default.aspx", year: 2026, period: "current MOH page", quantitative: false,
    statement: "The Ministry of Health describes Sehhaty as a platform giving users in the Kingdom a wide range of health services to support integrated care.",
    quote: "The platform provides users in the Kingdom with a wide range of health services provided to facilitate the provision of integrated healthcare to individuals" }),

  // ---- SFDA: digital health, software and AI ----
  f({ id: "sfda-dh-uses", organization: SFDA, sourceType: "Regulator", documentTitle: "Guidance on Digital Health Products (MDS-G-027)", url: G027, year: 2026, period: "SFDA guidance MDS-G-027, version 1", quantitative: false,
    statement: "SFDA's digital health guidance notes that digital health technologies range from public health applications to medical device applications.",
    quote: "Digital health technologies have a wide range of uses, ranging from public health applications to medical device applications." }),
  f({ id: "sfda-samd", organization: SFDA, sourceType: "Regulator", documentTitle: "Guidance on Digital Health Products (MDS-G-027)", url: G027, year: 2026, period: "SFDA guidance MDS-G-027, version 1", quantitative: false,
    statement: "SFDA's guidance adopts the IMDRF definition of Software as a Medical Device: software intended for one or more medical purposes that performs them without being part of a hardware medical device.",
    quote: "Software intended to be used for one or more medical purposes that perform these purposes without being part of a hardware medical device." }),
  f({ id: "sfda-ivd-route", organization: SFDA, sourceType: "Regulator", documentTitle: "Guidance on Digital Health Products (MDS-G-027)", url: G027, year: 2026, period: "SFDA guidance MDS-G-027, version 1", quantitative: true,
    statement: "Under the same guidance, software that meets the definition of an IVD medical device falls under the IVD framework in MDS-REQ 1.",
    quote: "When SaMD meets the definition of an IVD medical device, it falls under the regulatory framework for IVD medical devices, as outlined in (MDS-REQ 1)." }),
  f({ id: "sfda-wellness", organization: SFDA, sourceType: "Regulator", documentTitle: "Guidance on Digital Health Products (MDS-G-027)", url: G027, year: 2026, period: "SFDA guidance MDS-G-027, version 1", quantitative: false,
    statement: "A digital health product that qualifies as a general wellness device must state in its Arabic and English labeling that it is not intended for medical purposes.",
    quote: "If the digital health product qualifies as a general wellness device, the manufacturer shall clearly state in the labeling (in both Arabic and English) that the device is not intended for medical purposes." }),
  f({ id: "sfda-ai-ml", organization: SFDA, sourceType: "Regulator", documentTitle: "Guidance on Digital Health Products (MDS-G-027)", url: G027, year: 2026, period: "SFDA guidance MDS-G-027, version 1", quantitative: false,
    statement: "The guidance includes a dedicated section on artificial intelligence and machine learning in digital health products.",
    quote: "Artificial Intelligence and Machine Learning (AI/ML)" }),
  f({ id: "sfda-software-licensing", organization: SFDA, sourceType: "Regulator", documentTitle: "Minister of Health Launches Licensing Initiative for Medical Software Developers in Digital Health", url: "https://sfda.gov.sa/en/news/17375", year: 2024, publishedOn: "2024-10-22", quantitative: false,
    statement: "In October 2024 the Minister of Health launched an SFDA licensing initiative for medical software in digital health, intended to facilitate the use of software for diagnosis, treatment and medical decision-making.",
    quote: "launched a licensing initiative today for medical software in digital health. This initiative facilitates the use of software for diagnosis, treatment, and medical decision-making." }),
  f({ id: "sfda-ai-authorization", organization: SFDA, sourceType: "Regulator", documentTitle: "SFDA Grants Marketing Authorization for Two Saudi-Developed AI-Enabled Medical Software Products for Dental and Ophthalmic Diagnosis", url: "https://www.sfda.gov.sa/en/news/19462", year: 2026, publishedOn: "2026-09-10", quantitative: true,
    statement: "On 10 September 2026 the SFDA announced marketing authorization for two Saudi-developed AI-enabled medical software products, for dental and ophthalmic diagnosis.",
    quote: "SFDA Grants Marketing Authorization for Two Saudi-Developed AI-Enabled Medical Software Products for Dental and Ophthalmic Diagnosis" }),
  f({ id: "sfda-ecosystem", organization: SFDA, sourceType: "Regulator", documentTitle: "SFDA CEO: Saudi Arabia Has an Integrated Ecosystem Designed To Enable Emerging Medical Technologies", url: "https://www.sfda.gov.sa/en/news/19493", year: 2026, publishedOn: "2026-09-15", quantitative: false,
    statement: "The SFDA's chief executive explained that Saudi Arabia has an integrated ecosystem designed to enable emerging medical technologies, built on international best practices and drawing on digital infrastructure, trusted data governance and frameworks for AI and cybersecurity.",
    quote: "Saudi Arabia has an integrated ecosystem designed to enable emerging medical technologies. Built in accordance with international best practices, this system leverages advanced digital infrastructure, trusted data governance, and forward-looking frameworks for AI and cybersecurity." }),

  // ---- Biotechnology ----
  f({ id: "biotech-strategy", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Biotechnology Powers Saudi Arabia's Journey from Genomics to Pharmaceutical Security and a Sustainable Future", url: BIOTECH_MOH, year: 2025, publishedOn: "2025-07-15", period: "strategy launched 25 January 2024", quantitative: true,
    statement: "The National Biotechnology Strategy, launched in January 2024, is described by the Ministry of Health as a roadmap to make the Kingdom a global biotechnology hub by 2040.",
    quote: "launched the National Biotechnology Strategy, a comprehensive roadmap to transform the Kingdom into a global biotechnology hub by 2040" }),
  f({ id: "biotech-pillars", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Biotechnology Powers Saudi Arabia's Journey from Genomics to Pharmaceutical Security and a Sustainable Future", url: BIOTECH_MOH, year: 2025, publishedOn: "2025-07-15", quantitative: false,
    statement: "The strategy rests on four pillars, including localizing vaccine production, advancing biopharmaceutical manufacturing, and driving genomic and gene therapy research.",
    quote: "The National Biotechnology Strategy is built on four key strategic pillars: Localizing vaccine production, Advancing biopharmaceutical manufacturing, Driving genomic and gene therapy research" }),
  f({ id: "biotech-jobs", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Biotechnology Powers Saudi Arabia's Journey from Genomics to Pharmaceutical Security and a Sustainable Future", url: BIOTECH_MOH, year: 2025, publishedOn: "2025-07-15", quantitative: true,
    statement: "On human capital, the strategy aims to create over 11,000 specialized jobs by 2030, growing to 55,000 by 2040.",
    quote: "aiming to create over 11,000 specialized jobs by 2030, growing to 55,000 by 2040" }),
  f({ id: "biotech-bio2025", organization: MOH, sourceType: "Government", documentTitle: "MOH News – Biotechnology Powers Saudi Arabia's Journey from Genomics to Pharmaceutical Security and a Sustainable Future", url: BIOTECH_MOH, year: 2025, publishedOn: "2025-07-15", quantitative: true,
    statement: "A Saudi delegation to the 2025 BIO convention, led by the Ministry of Health and made up of 25 entities, presented a unified national biotechnology ecosystem.",
    quote: "The Saudi delegation, led by the Ministry of Health and composed of 25 entities, showcased a unified national ecosystem for biotechnology" }),
  f({ id: "biotech-biosimilars", organization: V2030_BIO, sourceType: "Official program", documentTitle: "National Biotechnology Strategy", url: "https://www.vision2030.gov.sa/media/iiwlzyo2/national-biotech-strategy-en.pdf", year: 2024, quantitative: false,
    statement: "The strategy document also aims to foster biosimilars penetration as a way to reduce healthcare spending.",
    quote: "Foster biosimilars penetration to reduce healthcare spend." }),

  // ---- Startup ecosystem and venture funding (all sectors) ----
  f({ id: "monshaat-vc-h1-2025", organization: MONSHAAT, sourceType: "Government", documentTitle: "Monsha'at Q2 2025 SME Monitor", url: SME_MONITOR, year: 2025, period: "H1 2025", publishedOn: "2025-09-25", quantitative: true,
    statement: "Monsha'at's SME Monitor for the second quarter of 2025 reports that total venture capital funding in the Kingdom (all sectors, not healthcare alone) rose 116% year over year to USD 860 million in the first half of 2025, while the deal count rose 31% to 114.",
    quote: "Total VC funding in the Kingdom increased 116% year-over-year to $860 million, while the deal count rose 31% to 114 transactions." }),
  f({ id: "monshaat-mena-share", organization: MONSHAAT, sourceType: "Government", documentTitle: "Monsha'at Q2 2025 SME Monitor", url: SME_MONITOR, year: 2025, period: "H1 2025", publishedOn: "2025-09-25", quantitative: true,
    statement: "The same report says Saudi Arabia was the MENA region's top venture capital destination for the third consecutive half-year, capturing 56% of regional funding (all sectors).",
    quote: "Saudi Arabia stood out as MENA's top VC destination for the third consecutive half-year, capturing 56% of regional funding." }),
  f({ id: "monshaat-riyadh-rank", organization: MONSHAAT, sourceType: "Government", documentTitle: "Saudi Arabia Rises 60 Places in Startup Ecosystem Rankings", url: "https://www.monshaat.gov.sa/en/node/322293", year: 2025, publishedOn: "2025-06-16", quantitative: true,
    statement: "Monsha'at reports that Riyadh rose 60 positions over three years to rank 23rd in the 2025 Global Startup Ecosystem Report by Startup Genome.",
    quote: "jumping 60 positions over the past three years to rank 23rd in the 2025 Global Startup Ecosystem Report by Startup Genome" }),
];

export const FACTS_BY_ID = new Map(LIBRARY_FACTS.map((x) => [x.id, x]));
