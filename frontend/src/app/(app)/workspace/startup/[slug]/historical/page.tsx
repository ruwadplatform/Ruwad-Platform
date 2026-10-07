import { MyHistoricalDataPage } from "@/features/workspace/MyHistoricalDataPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MyHistoricalDataPage slug={slug} />;
}
