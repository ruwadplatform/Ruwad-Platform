import { notFound } from "next/navigation";
import { ReportDetailPage } from "@/features/reports/ReportDetailPage";
import { fetchReportBySlug } from "@/lib/api/reports";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report;
  try {
    report = await fetchReportBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <EmptyState icon="help" title="Couldn't load this report" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!report) notFound();
  return <ReportDetailPage report={report} />;
}
