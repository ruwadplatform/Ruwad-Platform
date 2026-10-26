import { notFound } from "next/navigation";
import { MeetingPage } from "@/features/advisory/MeetingPage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!ADVISORY_ENABLED) notFound();
  const { id } = await params;
  return <MeetingPage id={id} />;
}
