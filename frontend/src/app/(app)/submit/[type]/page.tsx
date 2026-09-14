import { notFound } from "next/navigation";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { SubmissionWizard } from "@/features/submissions/SubmissionWizard";
import { ROUTE_TO_KIND, SCHEMAS } from "@/features/submissions/schemas";

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const kind = ROUTE_TO_KIND[type];
  if (!kind) notFound();
  const schema = SCHEMAS[kind];

  return (
    <div>
      <IntelligencePageHeader title={`Submit — ${schema.label}`} description={schema.description} />
      <div className="mt-20"><SubmissionWizard kind={kind} /></div>
    </div>
  );
}
