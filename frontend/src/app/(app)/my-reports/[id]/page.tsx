import { MySubmissionPage } from "@/features/reports/MySubmissionPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MySubmissionPage id={id} />;
}
