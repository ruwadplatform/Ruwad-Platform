import { SubmissionDetailPage } from "@/features/submissions/SubmissionDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionDetailPage id={id} />;
}
