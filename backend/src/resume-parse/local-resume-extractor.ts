import type { ParsedResumeFields } from "./resume-parse.service";

/** "No-AI" reading of a résumé: strict patterns over its own text, used when no ANTHROPIC_API_KEY is configured —
 * same fallback shape as the pitch-deck reader (local-deck-extractor.ts). Only reports what the résumé states in a
 * recognisable form; never guesses. A field this can't confidently find is simply omitted, exactly like the AI path. */

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const SECTION_HEADING = /^(resume|cv|curriculum vitae|profile|summary|objective|contact|contact information|contact details|personal information|about me|experience|work experience|professional experience|employment history|education|skills|certifications|projects|references|languages|interests)$/i;
const NON_NAME_LINE = /[@0-9(){}[\]/\\]|https?:|www\.|linkedin|github/i;
/** "Firstname Lastname", optionally with a courtesy prefix or a middle name/initial — never a section heading. */
const NAME_LINE = /^(?:(?:Mr|Mrs|Ms|Dr|Eng|Prof)\.?\s+)?([A-Z][a-zA-Z'-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-zA-Z'-]+){1,3})$/;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const REFERENCE_CONTEXT = /\b(reference|referee|recruiter|hiring manager|hr@|careers@|jobs@|apply@|recruitment@|talent@)\b/i;

const TITLE_WORDS = /\b(Manager|Engineer|Analyst|Assistant|Director|Coordinator|Specialist|Consultant|Officer|Lead|Head|Founder|Co-?Founder|President|Executive|Administrator|Supervisor|Developer|Designer|Architect|Scientist|Researcher|Nurse|Physician|Doctor|Pharmacist|Technician|Accountant|Advisor|Representative|Associate|Intern|Chief [A-Z][a-z]+ Officer|CEO|CTO|CFO|COO)\b/;
/** A résumé line naming a role, usually "Title, Company" / "Title — Company" / "Title at Company" / "Title | Company". */
const ROLE_LINE = /^([A-Z][A-Za-z&/ .-]{2,50}?)\s*(?:,|–|—|-|\||\bat\b|\bwith\b)\s*([A-Z][A-Za-z0-9&,. ]{1,60})$/;

const EXPERIENCE_HEADING = /^(experience|work experience|professional experience|employment( history)?|career (history|summary))$/i;

/** "City, Country" — the country must be one of the world's real countries so we never mistake, say, a company
 * name for a location. Kept in sync with frontend/src/data/reference.ts's ALL_COUNTRIES (duplicated rather than
 * shared across the frontend/backend workspace boundary — same tradeoff the deck extractor's own word lists make). */
const COUNTRIES = [
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
].sort((a, b) => b.length - a.length); // longest first so "United Arab Emirates" wins over a shorter partial match
const COUNTRY_ALIASES: Record<string, string> = { uae: "United Arab Emirates", usa: "United States", uk: "United Kingdom", ksa: "Saudi Arabia" };

function findEmail(lines: string[]): string | undefined {
  const candidates: { email: string; index: number }[] = [];
  lines.forEach((line, i) => {
    if (REFERENCE_CONTEXT.test(line)) return; // an HR/recruiter/careers address is not the candidate's own
    for (const m of line.matchAll(EMAIL_RE)) candidates.push({ email: m[0].replace(/[.,;]$/, ""), index: i });
  });
  if (!candidates.length) return undefined;
  // Résumés put the candidate's own contact details in the header — the first email mentioned is almost always theirs.
  return candidates[0].email;
}

function findName(lines: string[]): { first?: string; last?: string } {
  for (const line of lines.slice(0, 8)) {
    if (!line || SECTION_HEADING.test(line) || NON_NAME_LINE.test(line)) continue;
    const m = NAME_LINE.exec(line);
    if (!m) continue;
    const parts = m[1].split(/\s+/).filter((p) => !/^[A-Z]\.?$/.test(p)); // drop a bare middle initial
    if (parts.length < 2) continue;
    return { first: parts[0], last: parts[parts.length - 1] };
  }
  return {};
}

/** The most recent job title: the first "Title, Company"-shaped line inside (or just under) an Experience section,
 * since résumés are conventionally reverse-chronological. Falls back to a short title-looking line near the header
 * (a subtitle right under the name) — never a line pulled from a Skills section. */
function findJobTitle(lines: string[]): string | undefined {
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (EXPERIENCE_HEADING.test(lines[i])) { sectionStart = i + 1; break; }
  }
  const scanFrom = sectionStart >= 0 ? sectionStart : 0;
  const scanTo = sectionStart >= 0 ? Math.min(lines.length, sectionStart + 6) : Math.min(lines.length, 8);
  for (let i = scanFrom; i < scanTo; i++) {
    const line = lines[i];
    if (!line || line.length > 70 || SECTION_HEADING.test(line)) continue;
    const m = ROLE_LINE.exec(line);
    if (m && TITLE_WORDS.test(m[1])) return clean(m[1]);
    if (sectionStart < 0 && TITLE_WORDS.test(line) && line.split(" ").length <= 5 && !NON_NAME_LINE.test(line)) return line;
  }
  return undefined;
}

function findLocation(lines: string[]): { city?: string; country?: string } {
  for (const line of lines.slice(0, 12)) {
    for (const country of COUNTRIES) {
      const re = new RegExp(`([A-Z][a-zA-Z .'-]{2,30}),\\s*${country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const m = re.exec(line);
      if (m) return { city: clean(m[1]), country };
    }
    const alias = /(?:^|,|\s)(uae|usa|uk|ksa)\b/i.exec(line);
    if (alias) {
      const country = COUNTRY_ALIASES[alias[1].toLowerCase()];
      const cityMatch = /([A-Z][a-zA-Z .'-]{2,30}),\s*(?:uae|usa|uk|ksa)\b/i.exec(line);
      return { city: cityMatch ? clean(cityMatch[1]) : undefined, country };
    }
  }
  // Country-only mention (no city on the same line) — still worth filling Country, never worth guessing City.
  for (const line of lines.slice(0, 12)) {
    for (const country of COUNTRIES) if (new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line)) return { country };
  }
  return {};
}

export function localExtractResume(text: string): ParsedResumeFields {
  const lines = text.split("\n").map(clean).filter(Boolean);
  const fields: ParsedResumeFields = {};

  const email = findEmail(lines);
  if (email) fields.email = email;

  const { first, last } = findName(lines);
  if (first) fields.firstName = first;
  if (last) fields.lastName = last;

  const title = findJobTitle(lines);
  if (title) fields.jobTitle = title;

  const { city, country } = findLocation(lines);
  if (city) fields.city = city;
  if (country) fields.country = country;

  return fields;
}
