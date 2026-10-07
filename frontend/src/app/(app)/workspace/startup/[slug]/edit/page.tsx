import { EditStartupPage } from "@/features/workspace/EditStartupPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditStartupPage slug={slug} />;
}
