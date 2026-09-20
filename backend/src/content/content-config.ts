/** Everything that steers what the news/events harvesters look for and keep.
 * Kept in one file so queries, vocabularies and source rules are easy to tune
 * without touching the pipeline code. */

export const NEWS_CATEGORIES = [
  "Healthcare", "Biotechnology", "MedTech", "Digital Health", "AI Healthcare", "Genomics", "Diagnostics",
  "Pharmaceuticals", "Medical Devices", "Precision Medicine", "Healthcare Investment", "Research",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const EVENT_TYPES = [
  "Conference", "Summit", "Hackathon", "Workshop", "Webinar", "Startup Competition",
  "Investor Event", "Exhibition", "Networking Event", "Research Event",
] as const;
export type EventTypeName = (typeof EVENT_TYPES)[number];

/** Country names match frontend/src/data/reference.ts COUNTRIES so the UI
 * filter and the stored value agree. "GCC" / "MENA" are region labels for
 * stories that are regional rather than about one country. */
export const REGION_LABELS = ["GCC", "MENA"] as const;

export interface NewsQuery { q: string; gl: string }
/** Several targeted searches rather than one generic query (per the spec). */
export const NEWS_QUERIES: NewsQuery[] = [
  { q: "Saudi Arabia healthcare news", gl: "sa" },
  { q: "Middle East healthcare innovation news", gl: "ae" },
  { q: "Saudi biotechnology news", gl: "sa" },
  { q: "Saudi MedTech news", gl: "sa" },
  { q: "MENA digital health news", gl: "ae" },
  { q: "Saudi healthcare startup news", gl: "sa" },
  { q: "Middle East biotech funding news", gl: "ae" },
  { q: "Saudi medical device news", gl: "sa" },
  { q: "Middle East genomics news", gl: "ae" },
  { q: "Saudi precision medicine news", gl: "sa" },
  { q: "UAE healthcare AI news", gl: "ae" },
  { q: "Qatar Bahrain Kuwait Oman healthcare news", gl: "qa" },
  { q: "Egypt Jordan healthcare technology news", gl: "eg" },
  { q: "Saudi pharmaceutical diagnostics news", gl: "sa" },
];

export interface EventQuery { q: string; gl: string }
/** {Y} is replaced with the current year (and, for the core set, next year). */
export const EVENT_QUERY_TEMPLATES: EventQuery[] = [
  { q: "Saudi Arabia healthcare conference {Y}", gl: "sa" },
  { q: "Saudi biotechnology conference {Y}", gl: "sa" },
  { q: "Saudi MedTech event {Y}", gl: "sa" },
  { q: "Saudi digital health summit {Y}", gl: "sa" },
  { q: "Saudi healthcare hackathon {Y}", gl: "sa" },
  { q: "Middle East healthcare conference {Y}", gl: "ae" },
  { q: "MENA biotech event {Y}", gl: "ae" },
  { q: "Middle East MedTech summit {Y}", gl: "ae" },
  { q: "Middle East healthcare startup competition {Y}", gl: "ae" },
  { q: "Saudi healthcare exhibition {Y}", gl: "sa" },
  { q: "healthcare investor forum Riyadh Dubai {Y}", gl: "sa" },
];
/** These also run for next year so events announced ahead of time surface. */
export const EVENT_NEXT_YEAR_QUERIES = [0, 1, 5, 9];

/* ------------------------------------------------------------- relevance */
export const HEALTH_TERMS = [
  "health", "healthcare", "hospital", "medical", "medicine", "clinic", "clinical", "pharma", "pharmaceutical", "drug",
  "biotech", "biotechnology", "genom", "genetic", "diagnos", "patient", "surgery", "surgical", "disease", "vaccine",
  "telehealth", "telemedicine", "digital health", "medtech", "life science", "life sciences", "therapeutic", "therapy",
  "oncology", "cancer", "precision medicine", "healthtech", "biopharma", "nursing", "wellness", "ministry of health",
  "sfda", "dental", "cardio", "biolog", "biomedical", "genome", "crispr", "radiology", "laboratory",
];
export const NEGATIVE_HEALTH_CONTEXT = /\b(financial|economic|fiscal|market|credit|budget)\s+health\b/i;

/** Terms that signal the page is about an event and not a general article. */
export const EVENT_TERMS = [
  "conference", "summit", "expo", "exhibition", "forum", "hackathon", "congress", "symposium", "workshop",
  "webinar", "competition", "demo day", "pitch", "meetup", "convention", "festival", "masterclass", "bootcamp",
  "awards", "challenge", "networking",
];

/* ---------------------------------------------------------------- places */
export const COUNTRY_KEYWORDS: Record<string, string[]> = {
  "Saudi Arabia": ["saudi", "saudi arabia", "ksa", "riyadh", "jeddah", "dammam", "khobar", "neom", "kaust", "mecca", "makkah", "medina", "al ula", "vision 2030"],
  "UAE": ["uae", "united arab emirates", "dubai", "abu dhabi", "sharjah", "emirati", "ajman"],
  "Qatar": ["qatar", "doha", "qatari"],
  "Bahrain": ["bahrain", "manama", "bahraini"],
  "Kuwait": ["kuwait", "kuwaiti"],
  "Oman": ["oman", "muscat", "omani"],
  "Jordan": ["jordan", "amman", "jordanian"],
  "Egypt": ["egypt", "cairo", "egyptian", "alexandria"],
  "Lebanon": ["lebanon", "beirut", "lebanese"],
};
export const REGION_KEYWORDS: Record<string, string[]> = {
  "GCC": ["gcc", "gulf cooperation council", "the gulf"],
  "MENA": ["mena", "middle east", "north africa", "arab world", "arabian"],
};
export const CITY_KEYWORDS: Record<string, string> = {
  riyadh: "Riyadh", jeddah: "Jeddah", dammam: "Dammam", khobar: "Khobar", neom: "NEOM", "abu dhabi": "Abu Dhabi", dubai: "Dubai",
  sharjah: "Sharjah", doha: "Doha", manama: "Manama", muscat: "Muscat", amman: "Amman", cairo: "Cairo", beirut: "Beirut",
  thuwal: "Thuwal", makkah: "Makkah", mecca: "Makkah", medina: "Madinah", alkhobar: "Khobar",
};
export const TLD_COUNTRY: Record<string, string> = { sa: "Saudi Arabia", ae: "UAE", qa: "Qatar", bh: "Bahrain", kw: "Kuwait", om: "Oman", jo: "Jordan", eg: "Egypt", lb: "Lebanon" };

/* ------------------------------------------------------------- sources */
/** Hosts we never take stories or events from. */
export const BLOCKED_HOSTS = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "pinterest.com", "reddit.com", "quora.com",
  "youtube.com", "youtu.be", "wikipedia.org", "linkedin.com", "medium.com", "blogspot.com", "wordpress.com",
];
/** Third-party event listings: only a fallback when no primary source exists,
 * and never preferred over the organizer's own page. */
export const EVENT_AGGREGATOR_HOSTS = [
  "10times.com", "allevents.in", "eventbrite.com", "eventbrite.ae", "eventbrite.co.uk", "conferenceindex.org", "allconferencealert.com",
  "conferencealerts.com", "eventseye.com", "meetup.com", "eventzilla.net", "wikicfp.com", "internationalconferencealerts.com",
  "conferenceineurope.net", "waset.org", "predatoryjournals.org", "expodatabase.com", "tradefairdates.com",
  "cmegallery.com", "asiaactual.com", "edarabia.com", "medicaltourism.com", "eventsinamerica.com",
];
