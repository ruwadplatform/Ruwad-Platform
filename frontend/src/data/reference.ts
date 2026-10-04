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

/** Every country, for a global sign-up form — unlike COUNTRIES above (the curated
 * MENA-first shortlist directory filters use), a person creating a RUWĀD account
 * can be anywhere in the world. */
export const ALL_COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium",
  "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad",
  "Chile", "China", "Colombia", "Comoros", "Congo (Brazzaville)", "Congo (Kinshasa)", "Costa Rica", "Croatia",
  "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos",
  "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
  "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
] as const;

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

/* ------------------------------------------- "Publish a report" form (mirrors backend report-submission.constants.ts) */
export const REPORT_SUBMISSION_TYPES = [
  "Market Intelligence", "Sector Overview", "Startup Landscape", "Funding Landscape", "Investor Landscape",
  "Research Report", "Regulatory", "Clinical Innovation", "Other",
] as const;
export const REPORT_SUBMISSION_SECTORS = [
  "Digital Health", "Biotechnology", "MedTech", "Diagnostics", "Pharmaceuticals", "Healthcare AI", "Medical Devices",
  "Genomics", "Healthcare Services", "Healthcare IT", "Precision Medicine", "Therapeutics", "Other",
] as const;
export const REPORT_SUBMISSION_GEOGRAPHIES = ["Saudi Arabia", "GCC", "MENA", "Global", "Other"] as const;
export const REPORT_PDF_MAX_BYTES = 10 * 1024 * 1024;

/* ------------------------------------------------- RUWĀD Score data collection (Phase 1B) */

/** Standard 9-level Technology Readiness Level scale, given founder-facing
 * labels instead of a bare "1-9" picker. Must exactly match, in order,
 * backend/src/scoring/trl-labels.ts — that's the one place the label string
 * this select stores gets resolved back to the numeric level the scoring
 * engine expects. */
export const TRL_LABELS = [
  "Basic principles observed",
  "Technology concept formulated",
  "Experimental proof of concept",
  "Technology validated in lab",
  "Technology validated in relevant environment",
  "Technology demonstrated in relevant environment",
  "System prototype demonstration",
  "System complete and qualified",
  "Actual system proven, commercially deployed",
] as const;

/** Regulatory milestone ladders, one per pathway — must exactly match, in
 * order, the three ladders in backend/src/scoring/engines/regulatory.engine.ts
 * (case-insensitive match there), so a founder's selection is read as an
 * explicit, high-confidence milestone rather than falling back to the
 * coarser inference from SFDA/FDA/CE status. Category groupings mirror the
 * engine's pathwayFor() exactly, including its digital-health default for
 * any category not in the other two lists. */
export const REG_MILESTONES_DIGITAL_HEALTH = [
  "applicability assessed", "classification identified", "strategy prepared", "QMS readiness",
  "clinical validation", "submission preparation", "SFDA submission", "SFDA authorization", "FDA/CE/other approval",
] as const;
export const REG_MILESTONES_MEDICAL_DEVICE = [
  "device classification", "ISO 13485", "QMS", "technical documentation", "clinical evidence",
  "SFDA pathway", "MDMA", "FDA 510(k)/De Novo", "CE MDR", "approval", "commercialization",
] as const;
export const REG_MILESTONES_THERAPEUTIC = [
  "discovery", "preclinical", "IND/CTA preparation", "Phase I", "Phase II", "Phase III",
  "regulatory submission", "approval", "commercial stage",
] as const;
export const MEDICAL_DEVICE_CATEGORIES = ["MedTech", "Medical Devices", "Diagnostics"] as const;
export const THERAPEUTIC_CATEGORIES = ["Biotechnology", "Genomics", "Precision Medicine", "Therapeutics", "Pharmaceuticals", "CRO", "CDMO"] as const;
/** Every other HC_CATEGORIES value (including Digital Health itself) uses
 * the digital-health ladder — matches the engine's own default fallback. */

/** Categories whose companies report clinically (Product step's clinical
 * validation / peer-reviewed publications fields, and Regulatory step's
 * SFDA/FDA/CE-adjacent milestone framing) vs. purely digital ones. */
export const CLINICAL_CATEGORIES = ["Biotechnology", "MedTech", "Digital Health", "Diagnostics", "Genomics", "Precision Medicine", "Therapeutics", "Medical Devices", "Pharmaceuticals"] as const;
/** Categories where "active users" (vs. paying customers) is the more
 * meaningful traction metric. */
export const DIGITAL_HEALTH_LIKE_CATEGORIES = ["Digital Health", "Telemedicine", "Healthcare IT", "AI Healthcare", "Health Data"] as const;
