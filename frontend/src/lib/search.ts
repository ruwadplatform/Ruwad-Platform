/** Ported verbatim from matchSearchTokens() (js/search.js:54-68). */
export interface SearchToken {
  key: string;
  value: string;
}
export function matchSearchTokens(text: string, vocab: Record<string, readonly string[]>): { matches: SearchToken[]; remainder: string } {
  const entries: SearchToken[] = [];
  Object.keys(vocab).forEach((key) => (vocab[key] || []).forEach((value) => entries.push({ key, value })));
  entries.sort((a, b) => b.value.length - a.value.length);
  let remainder = " " + (text || "").trim() + " ";
  const matches: SearchToken[] = [];
  entries.forEach(({ key, value }) => {
    const re = new RegExp("(^|\\s)" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|\\s)", "i");
    if (re.test(remainder)) {
      matches.push({ key, value });
      remainder = remainder.replace(re, " ").replace(/\s+/g, " ");
    }
  });
  return { matches, remainder: remainder.trim() };
}
