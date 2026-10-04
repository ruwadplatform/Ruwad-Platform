import { AdminStartupScoringPage } from "@/features/admin/AdminStartupScoringPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminStartupScoringPage id={id} />;
}
