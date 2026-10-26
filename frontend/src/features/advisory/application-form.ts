/** The "Become an Advisor" form: its values, the checks that give instant feedback, and how it becomes the payload the server expects. Pure, so every
 * rule is unit-tested. The server checks all of this again (and the real contents of each file); these checks only save a round trip. */

/** Kept modest on purpose: uploads cross browser -> Vercel -> the API host, and multi-megabyte bodies were seen to drop on that path. Mirrors the server. */
export const MAX_CV_BYTES = 2 * 1024 * 1024;
export const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 1 * 1024 * 1024;
export const MAX_CERTIFICATES = 5;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export const DURATIONS = [30, 45, 60] as const;
export const DECLARATION_TEXT = "I confirm that the information provided is accurate and understand that my application will be reviewed before my advisor profile is published.";

export interface ApplicationValues {
  name: string; email: string; phone: string; designation: string; institution: string; location: string;
  specialization: string; specializations: string; yearsExperience: string; about: string; researchAreas: string;
  consultationServices: string; preferredMinutes: string; linkedinUrl: string; websiteUrl: string; declaration: boolean;
}

export const EMPTY_APPLICATION: ApplicationValues = {
  name: "", email: "", phone: "", designation: "", institution: "", location: "", specialization: "", specializations: "", yearsExperience: "", about: "",
  researchAreas: "", consultationServices: "", preferredMinutes: "", linkedinUrl: "", websiteUrl: "", declaration: false,
};

export type FileLike = { name: string; size: number };
export interface ApplicationFiles { cv: FileLike | null; certificates: FileLike[]; photo: FileLike | null }
export type FieldKey = keyof ApplicationValues | "cv" | "certificates" | "photo";
export type FieldErrors = Partial<Record<FieldKey, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^(?=(?:\D*\d){7,15}\D*$)\+?[0-9 ()\-.]{7,25}$/;
const LINKEDIN = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com(\/|$)/i;
const WEB = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

const ext = (name: string) => { const i = name.lastIndexOf("."); return i < 0 ? "" : name.slice(i).toLowerCase(); };
const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;

export const splitList = (s: string) => s.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);

type Slot = "cv" | "certificate" | "photo";
const SLOT: Record<Slot, { label: string; exts: string[]; max: number; nice: string }> = {
  cv: { label: "CV", exts: [".pdf"], max: MAX_CV_BYTES, nice: "PDF" },
  certificate: { label: "Certificate", exts: [".pdf", ".png", ".jpg", ".jpeg"], max: MAX_CERTIFICATE_BYTES, nice: "PDF, PNG or JPG" },
  photo: { label: "Photograph", exts: [".png", ".jpg", ".jpeg"], max: MAX_PHOTO_BYTES, nice: "PNG or JPG" },
};

/** Null when the file is acceptable for that slot. */
export function checkFile(slot: Slot, f: FileLike): string | null {
  const s = SLOT[slot];
  if (!s.exts.includes(ext(f.name))) return `${s.label} "${f.name}" must be a ${s.nice} file.`;
  if (f.size === 0) return `${s.label} "${f.name}" is empty.`;
  if (f.size > s.max) return `${s.label} "${f.name}" is larger than ${mb(s.max)}.`;
  return null;
}

/** What an Edit & Reapply already has on file, so a kept CV counts and the totals add up. */
export interface OnFile { cv: boolean; certificates: number; bytes: number }

export function validateApplication(v: ApplicationValues, files: ApplicationFiles, onFile: OnFile = { cv: false, certificates: 0, bytes: 0 }): FieldErrors {
  const e: FieldErrors = {};
  const len = (k: keyof ApplicationValues, min: number, max: number, label: string) => {
    const n = String(v[k]).trim().length;
    if (n === 0) e[k] = `${label} is required.`;
    else if (n < min) e[k] = `${label} must be at least ${min} characters.`;
    else if (n > max) e[k] = `${label} must be ${max} characters or fewer.`;
  };
  len("name", 2, 120, "Full name");
  if (!v.email.trim()) e.email = "Email address is required."; else if (!EMAIL.test(v.email.trim()) || v.email.trim().length > 254) e.email = "Enter a valid email address, for example name@university.edu.";
  if (!v.phone.trim()) e.phone = "Phone number is required."; else if (!PHONE.test(v.phone.trim())) e.phone = "Enter a valid phone number, for example +966 5X XXX XXXX.";
  len("designation", 2, 120, "Professional designation");
  len("institution", 2, 160, "Institution or organization");
  len("location", 2, 120, "City and country");
  len("specialization", 2, 120, "Primary specialization");
  const years = v.yearsExperience.trim();
  if (!years) e.yearsExperience = "Years of professional experience is required.";
  else if (!/^\d+$/.test(years) || Number(years) > 70) e.yearsExperience = "Enter a whole number from 0 to 70.";
  const about = v.about.trim().length;
  if (about === 0) e.about = "Professional biography is required."; else if (about < 50) e.about = `Write at least 50 characters (${about} so far).`; else if (about > 3000) e.about = "Keep the biography to 3000 characters or fewer.";
  if (splitList(v.specializations).length > 12) e.specializations = "List at most 12 additional specializations.";
  if (splitList(v.researchAreas).length > 12) e.researchAreas = "List at most 12 research interests.";
  if (v.consultationServices.trim().length > 1500) e.consultationServices = "Keep this to 1500 characters or fewer.";
  if (v.preferredMinutes && !DURATIONS.includes(Number(v.preferredMinutes) as (typeof DURATIONS)[number])) e.preferredMinutes = "Choose 30, 45 or 60 minutes.";
  if (v.linkedinUrl.trim() && !LINKEDIN.test(v.linkedinUrl.trim())) e.linkedinUrl = "Enter your LinkedIn address, starting with https://www.linkedin.com/";
  if (v.websiteUrl.trim() && !WEB.test(v.websiteUrl.trim())) e.websiteUrl = "Enter a web address starting with http:// or https://";

  if (!files.cv) { if (!onFile.cv) e.cv = "Attach your CV or resume as a PDF."; }
  else { const m = checkFile("cv", files.cv); if (m) e.cv = m; }
  if (onFile.certificates + files.certificates.length > MAX_CERTIFICATES) e.certificates = `Attach at most ${MAX_CERTIFICATES} certificates in total.`;
  else { const m = files.certificates.map((f) => checkFile("certificate", f)).find(Boolean); if (m) e.certificates = m; }
  if (files.photo) { const m = checkFile("photo", files.photo); if (m) e.photo = m; }
  const total = onFile.bytes + (files.cv?.size ?? 0) + files.certificates.reduce((s, f) => s + f.size, 0) + (files.photo?.size ?? 0);
  if (total > MAX_TOTAL_BYTES && !e.cv && !e.certificates && !e.photo) e.certificates = `All files together must be ${mb(MAX_TOTAL_BYTES)} or smaller.`;

  if (!v.declaration) e.declaration = "Please confirm the declaration before submitting.";
  return e;
}

/** The JSON the server validates. Blank optional boxes are left out rather than sent empty. */
export function toPayload(v: ApplicationValues, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const text = (s: string) => s.trim();
  const optional = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    name: text(v.name), email: text(v.email), phone: text(v.phone), designation: text(v.designation), institution: text(v.institution), location: text(v.location),
    specialization: text(v.specialization), specializations: splitList(v.specializations), yearsExperience: Number(v.yearsExperience.trim()), about: text(v.about),
    researchAreas: splitList(v.researchAreas), consultationServices: optional(v.consultationServices), preferredMinutes: v.preferredMinutes ? Number(v.preferredMinutes) : undefined,
    linkedinUrl: optional(v.linkedinUrl), websiteUrl: optional(v.websiteUrl), declaration: v.declaration, ...extra,
  };
}

const join = (xs: string[]) => xs.join(", ");

/** Prefills Edit & Reapply from what the applicant submitted: the profile carries most answers, the status carries the rest. The declaration always starts unticked. */
export function valuesFromApplication(profile: {
  name: string; institution: string; designation: string; location: string; specialization: string; specializations: string[]; researchAreas: string[]; about: string; yearsExperience: number | null;
}, form: { email: string | null; phone: string | null; consultationServices: string | null; preferredMinutes: number | null; linkedinUrl: string | null; websiteUrl: string | null }): ApplicationValues {
  return {
    name: profile.name, email: form.email ?? "", phone: form.phone ?? "", designation: profile.designation, institution: profile.institution, location: profile.location,
    specialization: profile.specialization, specializations: join(profile.specializations), yearsExperience: profile.yearsExperience === null ? "" : String(profile.yearsExperience), about: profile.about,
    researchAreas: join(profile.researchAreas), consultationServices: form.consultationServices ?? "", preferredMinutes: form.preferredMinutes ? String(form.preferredMinutes) : "",
    linkedinUrl: form.linkedinUrl ?? "", websiteUrl: form.websiteUrl ?? "", declaration: false,
  };
}

/** The order the fields appear in, so the first invalid one can be scrolled to and focused. */
export const FIELD_ORDER: FieldKey[] = [
  "name", "email", "phone", "designation", "institution", "location", "specialization", "specializations", "yearsExperience", "about", "researchAreas",
  "consultationServices", "preferredMinutes", "linkedinUrl", "websiteUrl", "cv", "certificates", "photo", "declaration",
];
