/** A member's LinkedIn link is only ever rendered when it is a real linkedin.com address, so stored data can never produce another kind of link. */
export function safeLinkedInUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
