import { notFound } from "next/navigation";
import { HubProfilePage } from "@/features/hubs/HubProfilePage";
import { fetchHubBySlug } from "@/lib/api/hubs";
import { sessionFetchOptions } from "@/lib/api/server-session";
import { JsonLd } from "@/lib/seo/JsonLd";
import { profileMetadata, profileUnavailable } from "@/lib/seo/profile-page";
import { profileJsonLd, type ProfileFacts } from "@/lib/seo/profile-seo";
import { ErrorState } from "@/components/shared/EmptyState";

const factsOf = (s: NonNullable<Awaited<ReturnType<typeof fetchHubBySlug>>>): ProfileFacts => ({ section: "hubs", slug: s.id, name: s.name, kind: s.type, city: s.city, country: s.country, founded: s.founded, text: [s.desc, s.about], updated: s.provenance?.lastUpdated });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const s = await fetchHubBySlug(id);
    return s ? profileMetadata(factsOf(s)) : profileUnavailable(true);
  } catch {
    return profileUnavailable(false);
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let hub;
  try {
    // The page shows this visitor what their account may see; the metadata above deliberately uses the public view only.
    hub = await fetchHubBySlug(id, await sessionFetchOptions());
  } catch {
    return (
      <div className="content-in wide">
        <ErrorState title="Couldn't load this hub" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!hub) notFound();
  return (
    <>
      <JsonLd data={profileJsonLd(factsOf(hub))} />
      <HubProfilePage hub={hub} />
    </>
  );
}
