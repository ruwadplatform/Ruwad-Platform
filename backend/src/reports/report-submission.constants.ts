/** Taxonomies offered on the "Publish a report" form. The frontend keeps a matching list in data/reference.ts
 * (the two workspaces don't share code), and the server re-validates every value against these. */
export const SUBMISSION_REPORT_TYPES = [
  "Market Intelligence", "Sector Overview", "Startup Landscape", "Funding Landscape", "Investor Landscape",
  "Research Report", "Regulatory", "Clinical Innovation", "Other",
] as const;

export const SUBMISSION_SECTORS = [
  "Digital Health", "Biotechnology", "MedTech", "Diagnostics", "Pharmaceuticals", "Healthcare AI", "Medical Devices",
  "Genomics", "Healthcare Services", "Healthcare IT", "Precision Medicine", "Therapeutics", "Other",
] as const;

export const SUBMISSION_GEOGRAPHIES = ["Saudi Arabia", "GCC", "MENA", "Global", "Other"] as const;

/** Categories the Reports directory already offers as chips; a submitted report is filed under one of them. */
export const REPORT_CATEGORY_CHIPS = [
  "Market Intelligence", "Digital Health", "Biotechnology", "MedTech", "Diagnostics", "Pharmaceuticals", "Healthcare Investment",
  "Saudi Healthcare", "GCC Healthcare", "MENA Healthcare", "Emerging Technologies", "Regulatory", "Clinical Innovation",
] as const;

export type SubmissionStatus = "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
export type ReportOrigin = "RUWAD" | "USER_SUBMITTED";

export const MAX_REPORT_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
export const REVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SourceLink { title: string; url: string }
