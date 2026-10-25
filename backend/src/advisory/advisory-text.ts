/** Free text typed by a person, made safe to store and show: control characters other than tab and line breaks are dropped, and the ends are
 * trimmed. (The NUL-byte pipe already runs globally; this also covers the rest of the C0 range.) Not HTML-escaped here: every place that renders
 * it escapes it (React in the screens, escapeHtml in emails). */
export function cleanText(s: string | undefined | null): string {
  let out = "";
  for (const ch of s ?? "") {
    const n = ch.charCodeAt(0);
    if (n >= 32 || n === 9 || n === 10 || n === 13) out += ch;
  }
  return out.trim();
}
