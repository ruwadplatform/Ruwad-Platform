import type { LibraryDefinition } from "./library-types";

/** Startup categories (from RUWĀD's own category list) that make up each sector group. */
export const DIGITAL_CATEGORIES = ["Digital Health", "Telemedicine", "Healthcare IT", "AI Healthcare", "Health Data"];
export const BIOTECH_CATEGORIES = ["Biotechnology", "Genomics", "Precision Medicine", "Therapeutics", "CRO", "CDMO"];
export const MEDTECH_CATEGORIES = ["MedTech", "Medical Devices", "Diagnostics"];

const WB_HEALTH = ["wb-health-exp-gdp", "wb-health-exp-pc", "wb-population", "wb-life-expectancy", "wb-physicians", "wb-nurses", "wb-beds"];

/** The six default reports. Content is assembled by library-narrative.ts; nothing here is a statistic. */
export const LIBRARY_DEFINITIONS: LibraryDefinition[] = [
  {
    slug: "saudi-healthcare-ecosystem-overview-2026", title: "Saudi Healthcare Ecosystem Overview 2026", category: "Market Intelligence", sector: "Healthcare", categories: null,
    description: "A sourced overview of the Saudi healthcare ecosystem: system indicators, transformation program, investment signals and the RUWĀD-mapped ecosystem.",
    researchTopic: "healthcare ecosystem",
    factIds: ["hstp-objectives", "hh-total-transfer", "hh-second-phase", "moh-gdp-projection", "ghe2025-total", "ghe2025-hospitals", "ghe2025-vc", "ghe2024-investments", "sfda-ecosystem", "sfda-software-licensing"],
    worldBankIds: WB_HEALTH,
  },
  {
    slug: "saudi-digital-health-landscape-2026", title: "Saudi Digital Health Landscape 2026", category: "Digital Health", sector: "Digital Health", categories: DIGITAL_CATEGORIES,
    description: "How digital health is regulated and deployed in Saudi Arabia, with the digital health companies and investors mapped on RUWĀD.",
    researchTopic: "digital health",
    factIds: ["sfda-dh-uses", "sfda-samd", "sfda-ivd-route", "sfda-wellness", "sfda-ai-ml", "sfda-software-licensing", "sfda-ai-authorization", "sehhaty", "hstp-virtual", "hstp-yusur", "moh-opportunities-2040"],
    worldBankIds: ["wb-population", "wb-health-exp-gdp"],
  },
  {
    slug: "saudi-biotechnology-landscape-2026", title: "Saudi Biotechnology Landscape 2026", category: "Biotechnology", sector: "Biotechnology", categories: BIOTECH_CATEGORIES,
    description: "The National Biotechnology Strategy, investment and localization signals, and the biotechnology companies and research base mapped on RUWĀD.",
    researchTopic: "biotechnology",
    factIds: ["biotech-strategy", "biotech-pillars", "biotech-jobs", "biotech-biosimilars", "biotech-bio2025", "ghe2025-lifesciences", "ghe2025-biotechfund", "moh-opportunities-2040"],
    worldBankIds: ["wb-rd"],
  },
  {
    slug: "saudi-medtech-landscape-2026", title: "Saudi MedTech Landscape 2026", category: "MedTech", sector: "MedTech", categories: MEDTECH_CATEGORIES,
    description: "Medical device and software regulation, localization signals and the MedTech companies mapped on RUWĀD.",
    researchTopic: "medical devices",
    factIds: ["sfda-samd", "sfda-ivd-route", "sfda-software-licensing", "sfda-ai-authorization", "sfda-ecosystem", "ghe2025-lifesciences"],
    worldBankIds: ["wb-rd"],
  },
  {
    slug: "saudi-healthcare-startup-funding-landscape-2026", title: "Saudi Healthcare Startup & Funding Landscape 2026", category: "Healthcare Investment", sector: "Healthcare", categories: null,
    description: "Venture funding signals from Monsha'at and the Ministry of Health, alongside the funding and investors recorded on RUWĀD.",
    researchTopic: "healthcare startup funding",
    factIds: ["monshaat-vc-h1-2025", "monshaat-mena-share", "monshaat-riyadh-rank", "ghe2025-vc", "ghe2025-biotechfund", "ghe2024-investments"],
    worldBankIds: [],
  },
  {
    slug: "saudi-healthcare-infrastructure-workforce-2026", title: "Saudi Healthcare Infrastructure & Workforce 2026", category: "Market Intelligence", sector: "Healthcare", categories: null,
    description: "Hospital capacity, workforce indicators and health-cluster organization, with the hubs and research institutions mapped on RUWĀD.",
    researchTopic: "healthcare infrastructure workforce",
    factIds: ["hstp-objectives", "hh-total-transfer", "hh-second-phase", "ghe2025-hospitals", "ghe2025-alhayat"],
    worldBankIds: ["wb-beds", "wb-physicians", "wb-nurses", "wb-population"],
  },
];
