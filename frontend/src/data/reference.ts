/** Ported verbatim from js/mock-data.js's reference/enum arrays. */
export const HC_CATEGORIES = [
  "Biotechnology", "MedTech", "Digital Health", "Diagnostics", "AI Healthcare",
  "Pharmaceuticals", "Medical Devices", "Genomics", "Precision Medicine",
  "Telemedicine", "Therapeutics", "Health Data", "Preventive Health",
  "Healthcare Services", "Healthcare IT", "CRO", "CDMO", "Manufacturing", "Other",
] as const;

export const CITIES = ["Riyadh", "Jeddah", "Eastern Province", "Khobar", "NEOM", "Dammam", "GCC", "MENA"] as const;
export const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"] as const;
export const BIZ_MODELS = ["B2B", "B2C", "B2G", "B2B2C"] as const;
export const STATUSES = ["Active", "Acquired", "Public", "Inactive"] as const;
export const INVESTOR_TYPES = [
  "VC", "Corporate VC", "Sovereign", "Family Office", "Angel Network",
  "Venture Studio", "Accelerator", "Government Fund",
] as const;

/* ----------------------------------------------------------- Phase 2 additions */
export const HUB_TYPES = [
  "Accelerator", "Incubator", "Venture Studio", "Innovation Hub", "Government Program",
  "University Program", "Research Center", "Corporate Innovation Program", "Ecosystem Enabler",
] as const;

export const RESEARCH_INSTITUTION_TYPES = [
  "Research University", "National Research Center", "Biomedical Research Center",
  "University", "Academic Medical Center", "Medical University", "Research Hospital",
] as const;

/** "Research Field" filter — the institution's own coreResearchAreas are
 * free text, this is the fixed vocabulary the directory filters against. */
export const RESEARCH_FIELDS = [
  "Genomics", "Biotechnology", "Clinical Research", "Precision Medicine", "AI Healthcare",
  "Public Health", "Neuroscience", "Oncology", "Immunology", "Medical Devices",
] as const;

export const COUNTRIES = [
  "Saudi Arabia", "UAE", "Qatar", "Bahrain", "Kuwait", "Oman", "Jordan", "Egypt", "Lebanon",
  "United States", "United Kingdom", "Germany", "Switzerland", "France", "Ireland", "Netherlands",
] as const;

export const COMPANY_SIZES = ["Large Enterprise (10,000+)", "Enterprise (1,000-9,999)", "Mid-size (100-999)"] as const;

/* ----------------------------------------------------------- Phase 3 additions */
export const REPORT_CATEGORIES = [
  "Market Intelligence", "Digital Health", "Biotechnology", "MedTech", "Diagnostics",
  "Pharmaceuticals", "Healthcare Investment", "Saudi Healthcare", "GCC Healthcare",
  "MENA Healthcare", "Emerging Technologies", "Regulatory", "Clinical Innovation",
] as const;

export const NEWS_CATEGORIES = [
  "Healthcare", "Biotechnology", "MedTech", "Digital Health", "AI Healthcare", "Genomics", "Diagnostics",
  "Pharmaceuticals", "Medical Devices", "Precision Medicine", "Healthcare Investment", "Research",
] as const;

export const EVENT_TYPES = [
  "Conference", "Summit", "Hackathon", "Workshop", "Webinar", "Startup Competition",
  "Investor Event", "Exhibition", "Networking Event", "Research Event",
] as const;
