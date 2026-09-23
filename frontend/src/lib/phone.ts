import { countryForE164, countryForIso2 } from "@/data/phone-codes";

/** Combines a selected country's dial code with whatever the user typed into the number field into
 * a normalized E.164 value ("+966501234567") — spaces, dashes, dots and parentheses in the typed
 * part are stripped, never rejected, matching how people naturally type a phone number. Returns null
 * if the result isn't a plausible phone number (E.164 allows 8–15 digits total, including the
 * country code) — this is a light, format-only check; it doesn't know which numbers within a country
 * are actually assigned, the same tradeoff a signup form's client-side email check makes. */
export function toE164(iso2: string, rawNumber: string): string | null {
  const trimmed = rawNumber.trim();
  // Spaces, dashes, dots and parentheses are normal phone formatting; letters are not — reject
  // those outright rather than silently stripping them (e.g. "call-1234abcd" should not quietly
  // become a "valid" number just because enough digits happen to be left over).
  if (!/^[\d\s()+.-]+$/.test(trimmed)) return null;
  const dial = countryForIso2(iso2)?.dial;
  if (!dial) return null;
  const digits = trimmed.replace(/[^\d]/g, "").replace(/^0+/, ""); // a leading trunk "0" is a local-dialing prefix, not part of the number
  if (!digits) return null;
  const e164 = `+${dial}${digits}`;
  return isPlausibleE164(e164) ? e164 : null;
}

/** 8–15 digits after the leading "+", the range libphonenumber/E.164 itself uses — not a guess. */
export function isPlausibleE164(value: string): boolean {
  const digits = value.replace(/^\+/, "");
  return /^\d{8,15}$/.test(digits);
}

/** Splits a résumé-extracted phone string into (iso2, local number) for autofill. Only used when the
 * string starts with "+" (an explicit international code) — a bare local-format number found in a
 * résumé is filled into the number field as-is, without guessing which country it belongs to. */
export function splitE164ForAutofill(raw: string): { iso2: string; number: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) return null;
  const match = countryForE164(trimmed);
  if (!match) return null;
  const digits = trimmed.replace(/[^\d]/g, "").slice(match.dial.length);
  if (!digits) return null;
  return { iso2: match.iso2, number: digits };
}
