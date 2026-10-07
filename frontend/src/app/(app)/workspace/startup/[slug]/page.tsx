import { MyStartupPage } from "@/features/workspace/MyStartupPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MyStartupPage slug={slug} />;
}
