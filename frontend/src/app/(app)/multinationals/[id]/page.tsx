import { notFound } from "next/navigation";
import { MultinationalProfilePage } from "@/features/multinationals/MultinationalProfilePage";
import { fetchMultinationalBySlug } from "@/lib/api/multinationals";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let mnc;
  try {
    mnc = await fetchMultinationalBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <EmptyState icon="help" title="Couldn't load this company" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!mnc) notFound();
  return <MultinationalProfilePage mnc={mnc} />;
}
