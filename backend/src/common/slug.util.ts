/** Ported verbatim from the frontend's slug()/initials() (src/lib/scoring.ts)
 * so backend-generated slugs and logo initials match the ones already
 * baked into the seeded frontend data exactly — no ID/slug drift. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function compositeScore(scores: number[]): number {
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10);
}

/** Same "slug, slug-2, slug-3…" uniqueness loop every directory service
 * already has, generalized to run against an arbitrary EntityManager/repo
 * so it can execute inside a submission-approval transaction (the five
 * per-module `uniqueSlug()` private methods can't be reused there since
 * they're bound to that module's own injected, non-transactional repo). */
export async function uniqueSlugFor(
  findOne: (slug: string) => Promise<{ id: string } | null>,
  name: string,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  for (;;) {
    const existing = await findOne(slug);
    if (!existing) return slug;
    slug = `${base}-${n++}`;
  }
}
