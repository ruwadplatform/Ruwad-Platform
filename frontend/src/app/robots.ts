import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { buildRobots } from "@/lib/seo/rules";

/** Looks at the address the crawler used: the canonical production host gets the real rules, every other address (the older *.vercel.app one, previews) is closed. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  return buildRobots(process.env, (h.get("x-forwarded-host") ?? h.get("host") ?? undefined)?.split(",")[0]?.trim());
}
