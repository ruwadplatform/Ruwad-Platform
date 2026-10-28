import { notFound } from "next/navigation";
import { MultinationalProfilePage } from "@/features/multinationals/MultinationalProfilePage";
import { fetchMultinationalBySlug } from "@/lib/api/multinationals";
import { sessionFetchOptions } from "@/lib/api/server-session";
import { JsonLd } from "@/lib/seo/JsonLd";
import { profileMetadata, profileUnavailable } from "@/lib/seo/profile-page";
import { profileJsonLd, type ProfileFacts } from "@/lib/seo/profile-seo";
import { ErrorState } from "@/components/shared/EmptyState";

const factsOf = (s: NonNullable<Awaited<ReturnType<typeof fetchMultinationalBySlug>>>): ProfileFacts => ({ section: "multinationals", slug: s.id, name: s.name, kind: s.category, city: s.city, country: s.country, founded: s.founded, text: [s.tagline, s.desc], updated: s.provenance?.lastUpdated });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const s = await fetchMultinationalBySlug(id);
    return s ? profileMetadata(factsOf(s)) : profileUnavailable(true);
  } catch {
    return profileUnavailable(false);
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let mnc;
  try {
    // The page shows this visitor what their account may see; the metadata above deliberately uses the public view only.
    mnc = await fetchMultinationalBySlug(id, await sessionFetchOptions());
  } catch {
    return (
      <div className="content-in wide">
        <ErrorState title="Couldn't load this company" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!mnc) notFound();
  return (
    <>
      <JsonLd data={profileJsonLd(factsOf(mnc))} />
      <MultinationalProfilePage mnc={mnc} />
    </>
  );
}
