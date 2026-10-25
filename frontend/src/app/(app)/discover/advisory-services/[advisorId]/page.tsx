import { notFound } from "next/navigation";
import { AdvisorProfilePage } from "@/features/advisory/AdvisorProfilePage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default async function Page({ params }: { params: Promise<{ advisorId: string }> }) {
  if (!ADVISORY_ENABLED) notFound();
  const { advisorId } = await params;
  return <AdvisorProfilePage advisorId={advisorId} />;
}
