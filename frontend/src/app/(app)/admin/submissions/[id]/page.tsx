import { AdminSubmissionDetailPage } from "@/features/admin/AdminSubmissionDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminSubmissionDetailPage id={id} />;
}
