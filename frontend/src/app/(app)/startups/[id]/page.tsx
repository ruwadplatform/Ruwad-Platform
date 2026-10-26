import { notFound } from "next/navigation";
import { StartupProfilePage } from "@/features/startups/StartupProfilePage";
import { fetchStartupBySlug } from "@/lib/api/startups";
import { JsonLd } from "@/lib/seo/JsonLd";
import { profileMetadata, profileUnavailable } from "@/lib/seo/profile-page";
import { profileJsonLd, type ProfileFacts } from "@/lib/seo/profile-seo";
import { ErrorState } from "@/components/shared/EmptyState";

const factsOf = (s: NonNullable<Awaited<ReturnType<typeof fetchStartupBySlug>>>): ProfileFacts => ({ section: "startups", slug: s.id, name: s.name, kind: s.category, city: s.city, country: s.country, founded: s.founded, text: [s.tagline, s.desc], updated: s.provenance?.lastUpdated });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const s = await fetchStartupBySlug(id);
    return s ? profileMetadata(factsOf(s)) : profileUnavailable(true);
  } catch {
    return profileUnavailable(false);
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let startup;
  try {
    startup = await fetchStartupBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <ErrorState title="Couldn't load this startup" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!startup) notFound();
  return (
    <>
      <JsonLd data={profileJsonLd(factsOf(startup))} />
      <StartupProfilePage startup={startup} />
    </>
  );
}
