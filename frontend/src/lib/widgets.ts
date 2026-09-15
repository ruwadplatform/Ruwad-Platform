/** Ported verbatim from js/widgets.js's generic helper functions. */

export function regBadgeClass(reg: string | undefined | null): string {
  if (!reg) return "badge-neutral";
  const r = reg.toLowerCase();
  if (r.includes("approved") || r.includes("registered")) return "badge-good";
  if (r.includes("concept")) return "badge-neutral";
  return "badge-warn";
}

export function fmtProvenanceDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
