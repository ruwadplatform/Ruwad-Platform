import { ManageDataRoomPage } from "@/features/workspace/ManageDataRoomPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ManageDataRoomPage slug={slug} />;
}
