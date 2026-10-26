import * as path from "path";
import { Kind, safeFileName, signatureMatches } from "../data-room/data-room-files.service";

/** Supporting documents for an advisor application: what is accepted, and the check that a file really is what its name claims. Pure, so every
 * rule is unit-tested without a server. The same signature check as the Data Room: a renamed file is never stored as something it is not. */

export type ApplicationDocKind = "CV" | "CERTIFICATE" | "PHOTO";

const MB = 1024 * 1024;

interface Rule { label: string; types: Record<string, { mime: string; kind: Kind }>; maxBytes: number; maxCount: number }

const PDF = { ".pdf": { mime: "application/pdf", kind: "pdf" as Kind } };
const IMAGES = { ".png": { mime: "image/png", kind: "png" as Kind }, ".jpg": { mime: "image/jpeg", kind: "jpg" as Kind }, ".jpeg": { mime: "image/jpeg", kind: "jpg" as Kind } };

export const DOC_RULES: Record<ApplicationDocKind, Rule> = {
  CV: { label: "CV or resume", types: PDF, maxBytes: 2 * MB, maxCount: 1 },
  CERTIFICATE: { label: "Professional certificate", types: { ...PDF, ...IMAGES }, maxBytes: 2 * MB, maxCount: 5 },
  PHOTO: { label: "Profile photograph", types: IMAGES, maxBytes: 1 * MB, maxCount: 1 },
};
/** Deliberately modest: uploads travel browser -> Vercel -> the API host, and multi-megabyte bodies were seen to drop on that path (see the production-readiness notes). */
export const MAX_TOTAL_APPLICATION_BYTES = 8 * MB;

const niceTypes = (kind: ApplicationDocKind) => Object.keys(DOC_RULES[kind].types).map((e) => e.slice(1).toUpperCase()).filter((e, i, a) => a.indexOf(e) === i && !(e === "JPEG" && a.includes("JPG"))).join(", ");

export interface UploadedFile { originalname?: string; size: number; buffer?: Buffer }
export interface CheckedFile { kind: ApplicationDocKind; fileName: string; mimeType: string; size: number; data: Buffer }

/** One file against its slot's rules. Returns the stored form, or the message to show the applicant. */
export function checkFile(kind: ApplicationDocKind, file: UploadedFile): { ok: true; file: CheckedFile } | { ok: false; error: string } {
  const rule = DOC_RULES[kind];
  const name = safeFileName(file.originalname ?? "");
  const ext = path.extname(name).toLowerCase();
  const type = rule.types[ext];
  if (!type) return { ok: false, error: `${rule.label} "${name}" must be a ${niceTypes(kind)} file.` };
  if (!file.buffer?.length || file.size === 0) return { ok: false, error: `${rule.label} "${name}" is empty.` };
  if (file.size > rule.maxBytes) return { ok: false, error: `${rule.label} "${name}" is larger than ${rule.maxBytes / MB} MB.` };
  if (!signatureMatches(type.kind, file.buffer)) return { ok: false, error: `${rule.label} "${name}" isn't a valid ${ext.slice(1).toUpperCase()} file. Re-export it and try again.` };
  return { ok: true, file: { kind, fileName: name, mimeType: type.mime, size: file.size, data: file.buffer } };
}

/** The whole upload: the CV is required (unless an update keeps the one already on file), certificates and the photograph are optional. Collects every problem so the applicant can fix them in one go. */
export function checkApplicationFiles(input: { cv?: UploadedFile[]; certificates?: UploadedFile[]; photo?: UploadedFile[] }, opts: { requireCv?: boolean } = {}): { files: CheckedFile[]; errors: string[] } {
  const errors: string[] = [];
  const files: CheckedFile[] = [];
  const slots: [ApplicationDocKind, UploadedFile[]][] = [["CV", input.cv ?? []], ["CERTIFICATE", input.certificates ?? []], ["PHOTO", input.photo ?? []]];
  if ((opts.requireCv ?? true) && !(input.cv ?? []).length) errors.push("Attach your CV or resume as a PDF.");
  for (const [kind, list] of slots) {
    if (list.length > DOC_RULES[kind].maxCount) { errors.push(`You can attach at most ${DOC_RULES[kind].maxCount} ${DOC_RULES[kind].label.toLowerCase()} file${DOC_RULES[kind].maxCount === 1 ? "" : "s"}.`); continue; }
    for (const f of list) {
      const r = checkFile(kind, f);
      if (r.ok) files.push(r.file); else errors.push(r.error);
    }
  }
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_APPLICATION_BYTES) errors.push(`All files together must be ${MAX_TOTAL_APPLICATION_BYTES / MB} MB or smaller.`);
  return { files, errors };
}
