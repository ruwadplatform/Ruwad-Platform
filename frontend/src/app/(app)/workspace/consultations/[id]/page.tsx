import { notFound } from "next/navigation";
import { ConsultationDetailPage } from "@/features/advisory/ConsultationDetailPage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!ADVISORY_ENABLED) notFound();
  const { id } = await params;
  return <ConsultationDetailPage id={id} />;
}
