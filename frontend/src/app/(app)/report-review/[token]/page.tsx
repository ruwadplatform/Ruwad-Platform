import { ReportReviewPage } from "@/features/reports/ReportReviewPage";

export const metadata = { title: "Review report — RUWĀD", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ action?: string }> }) {
  const { token } = await params;
  const { action } = await searchParams;
  return <ReportReviewPage token={token} action={action === "accept" || action === "reject" ? action : undefined} />;
}
