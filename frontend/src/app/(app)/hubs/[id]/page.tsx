import { notFound } from "next/navigation";
import { HubProfilePage } from "@/features/hubs/HubProfilePage";
import { fetchHubBySlug } from "@/lib/api/hubs";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let hub;
  try {
    hub = await fetchHubBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <EmptyState icon="help" title="Couldn't load this hub" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!hub) notFound();
  return <HubProfilePage hub={hub} />;
}
