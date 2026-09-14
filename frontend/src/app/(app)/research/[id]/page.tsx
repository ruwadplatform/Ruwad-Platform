import { notFound } from "next/navigation";
import { ResearchProfilePage } from "@/features/research/ResearchProfilePage";
import { fetchResearchBySlug } from "@/lib/api/research";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let institution;
  try {
    institution = await fetchResearchBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <EmptyState icon="help" title="Couldn't load this institution" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!institution) notFound();
  return <ResearchProfilePage institution={institution} />;
}
