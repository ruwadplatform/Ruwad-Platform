import { AdminStartupOutcomesPage } from "@/features/admin/AdminStartupOutcomesPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminStartupOutcomesPage id={id} />;
}
