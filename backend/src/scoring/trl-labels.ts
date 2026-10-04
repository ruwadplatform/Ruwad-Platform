/** Standard 9-level Technology Readiness Level scale, given founder-facing
 * labels instead of a bare "1-9" picker — the wizard's select stores the
 * label string (like every other select field), and this is the one place
 * that resolves it back to the numeric level the technology engine expects.
 * The frontend's TRL_LABELS in data/reference.ts must list the exact same
 * strings, in the same order, for the mapping to round-trip. */
export const TRL_LABELS: string[] = [
  "Basic principles observed",
  "Technology concept formulated",
  "Experimental proof of concept",
  "Technology validated in lab",
  "Technology validated in relevant environment",
  "Technology demonstrated in relevant environment",
  "System prototype demonstration",
  "System complete and qualified",
  "Actual system proven, commercially deployed",
];

export function trlLevelForLabel(label: string | undefined | null): number | undefined {
  if (!label) return undefined;
  const i = TRL_LABELS.indexOf(label);
  return i >= 0 ? i + 1 : undefined;
}
