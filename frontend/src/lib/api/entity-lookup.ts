import { api } from "./client";

/** Every directory's public GET-by-id route actually resolves by slug (see
 * StartupsController.findOne(@Param("slug"))), but Submission only stores
 * the entity's raw database id (publishedEntityId). This resolves id -> slug
 * by searching the directory list for the matching row, so an admin's "View
 * Published Entity" link (built from publishedEntityId) doesn't 404. */
export async function resolveEntitySlug(routeSegment: string, entityId: string, searchHint: string): Promise<string | null> {
  try {
    const res = await api.get<{ items: { id: string; slug: string }[] }>(`/${routeSegment}s?search=${encodeURIComponent(searchHint)}&limit=25`);
    return res.items.find((x) => x.id === entityId)?.slug ?? null;
  } catch {
    return null;
  }
}
