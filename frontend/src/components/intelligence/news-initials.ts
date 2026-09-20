/** Two letters from a publisher's name, for the tile shown when an article has no usable image. */
export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  const second = words.length > 1 ? words[1] : first.slice(1);
  return ((first[0] ?? "") + (second[0] ?? "")).toUpperCase() || "R";
}
