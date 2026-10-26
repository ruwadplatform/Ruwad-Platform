import { notFound } from "next/navigation";
import { ResearchProfilePage } from "@/features/research/ResearchProfilePage";
import { fetchResearchBySlug } from "@/lib/api/research";
import { JsonLd } from "@/lib/seo/JsonLd";
import { profileMetadata, profileUnavailable } from "@/lib/seo/profile-page";
import { profileJsonLd, type ProfileFacts } from "@/lib/seo/profile-seo";
import { ErrorState } from "@/components/shared/EmptyState";

const factsOf = (s: NonNullable<Awaited<ReturnType<typeof fetchResearchBySlug>>>): ProfileFacts => ({ section: "research", slug: s.id, name: s.name, kind: s.type, city: s.city, country: s.country, founded: s.founded, text: [s.about], updated: s.provenance?.lastUpdated });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const s = await fetchResearchBySlug(id);
    return s ? profileMetadata(factsOf(s)) : profileUnavailable(true);
  } catch {
    return profileUnavailable(false);
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let institution;
  try {
    institution = await fetchResearchBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <ErrorState title="Couldn't load this institution" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!institution) notFound();
  return (
    <>
      <JsonLd data={profileJsonLd(factsOf(institution))} />
      <ResearchProfilePage institution={institution} />
    </>
  );
}
