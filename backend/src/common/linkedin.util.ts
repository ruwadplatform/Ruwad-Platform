/** Accepts what a person pastes into a "LinkedIn profile" box ("linkedin.com/in/x", "www.linkedin.com/in/x", a full https link) and returns a clean
 * https URL, or undefined when it is blank or is not a linkedin.com address. Only these links are ever stored or shown, so a profile can never
 * carry a "javascript:" or look-alike link. */
export function normalizeLinkedInUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return undefined;
    if (url.pathname.length <= 1) return undefined; // the bare linkedin.com home page is not a profile
    return `https://${host}${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

/** Same check as a validator pattern: empty is fine, otherwise it must look like a linkedin.com address. */
export const LINKEDIN_PATTERN = /^$|^(https?:\/\/)?([\w-]+\.)*linkedin\.com\/\S+$/i;
