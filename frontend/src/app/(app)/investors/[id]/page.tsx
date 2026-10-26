import { notFound } from "next/navigation";
import { InvestorProfilePage } from "@/features/investors/InvestorProfilePage";
import { fetchInvestorBySlug } from "@/lib/api/investors";
import { JsonLd } from "@/lib/seo/JsonLd";
import { profileMetadata, profileUnavailable } from "@/lib/seo/profile-page";
import { profileJsonLd, type ProfileFacts } from "@/lib/seo/profile-seo";
import { ErrorState } from "@/components/shared/EmptyState";

const factsOf = (s: NonNullable<Awaited<ReturnType<typeof fetchInvestorBySlug>>>): ProfileFacts => ({ section: "investors", slug: s.id, name: s.name, kind: s.type, city: s.city, founded: s.founded, text: [s.desc, s.thesis], updated: s.provenance?.lastUpdated });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const s = await fetchInvestorBySlug(id);
    return s ? profileMetadata(factsOf(s)) : profileUnavailable(true);
  } catch {
    return profileUnavailable(false);
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let investor;
  try {
    investor = await fetchInvestorBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <ErrorState title="Couldn't load this investor" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!investor) notFound();
  return (
    <>
      <JsonLd data={profileJsonLd(factsOf(investor))} />
      <InvestorProfilePage investor={investor} />
    </>
  );
}
