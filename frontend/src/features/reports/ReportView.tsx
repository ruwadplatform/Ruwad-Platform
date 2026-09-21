"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSession } from "@/hooks/use-store";
import { fetchAdminReportBySlug } from "@/lib/api/reports";
import type { Report } from "@/types/intelligence";
import { GeneratedReportView } from "./GeneratedReportView";
import { ReportDetailPage } from "./ReportDetailPage";

/** Generated reports get the single-flow view; hand-written (legacy) reports keep their existing page. */
export function ReportView({ report }: { report: Report }) {
  return report.generated ? <GeneratedReportView report={report} /> : <ReportDetailPage report={report} />;
}

/** Drafts are not public, so the server-side page cannot load them. Admins fetch them here with their own session. */
export function AdminReportLoader({ slug }: { slug: string }) {
  const { isAdmin, hydrated } = useSession();
  const [state, setState] = useState<{ report: Report | null; done: boolean }>({ report: null, done: false });
  useEffect(() => {
    if (!hydrated) return;
    if (!isAdmin) return;
    let live = true;
    fetchAdminReportBySlug(slug).then((r) => live && setState({ report: r, done: true })).catch(() => live && setState({ report: null, done: true }));
    return () => { live = false; };
  }, [hydrated, isAdmin, slug]);

  if (state.report) return <ReportView report={state.report} />;
  const done = state.done || (hydrated && !isAdmin);
  return (
    <div className="content-in wide">
      {done
        ? <EmptyState icon="help" title="Report not found" body="This report doesn't exist or hasn't been published yet." />
        : <EmptyState icon="search" title="Loading report…" body="" />}
    </div>
  );
}
