import { notFound } from "next/navigation";
import { AdvisorProfilePlaceholder } from "@/features/advisory/AdvisorProfilePlaceholder";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default async function Page({ params }: { params: Promise<{ advisorId: string }> }) {
  if (!ADVISORY_ENABLED) notFound();
  const { advisorId } = await params;
  return <AdvisorProfilePlaceholder advisorId={advisorId} />;
}
