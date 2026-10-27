import { ReportView, AdminReportLoader } from "@/features/reports/ReportView";
import { fetchReportBySlug } from "@/lib/api/reports";
import { sessionFetchOptions } from "@/lib/api/server-session";
import { privateMetadata } from "@/lib/seo/metadata";
import { ErrorState } from "@/components/shared/EmptyState";

// Report pages stay out of search results while their content exposure is being settled; the Reports directory itself is indexable. The title is the report's own (public view).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const report = await fetchReportBySlug(id);
    return privateMetadata(report?.title ?? "Report");
  } catch {
    return privateMetadata("Report");
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report;
  try {
    report = await fetchReportBySlug(id, await sessionFetchOptions());
  } catch {
    return (
      <div className="content-in wide">
        <ErrorState title="Couldn't load this report" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  // Not public: it may be a draft an admin can open, so the browser checks with the admin's own session.
  if (!report) return <AdminReportLoader slug={id} />;
  return <ReportView report={report} />;
}
