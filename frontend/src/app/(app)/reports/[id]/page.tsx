import { ReportView, AdminReportLoader } from "@/features/reports/ReportView";
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
  // Not public: it may be a draft an admin can open, so the browser checks with the admin's own session.
  if (!report) return <AdminReportLoader slug={id} />;
  return <ReportView report={report} />;
}
