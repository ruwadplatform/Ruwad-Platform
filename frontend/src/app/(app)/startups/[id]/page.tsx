import { notFound } from "next/navigation";
import { StartupProfilePage } from "@/features/startups/StartupProfilePage";
import { fetchStartupBySlug } from "@/lib/api/startups";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let startup;
  try {
    startup = await fetchStartupBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <EmptyState icon="help" title="Couldn't load this startup" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!startup) notFound();
  return <StartupProfilePage startup={startup} />;
}
