import { notFound } from "next/navigation";
import { InvestorProfilePage } from "@/features/investors/InvestorProfilePage";
import { fetchInvestorBySlug } from "@/lib/api/investors";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let investor;
  try {
    investor = await fetchInvestorBySlug(id);
  } catch {
    return (
      <div className="content-in wide">
        <EmptyState icon="help" title="Couldn't load this investor" body="The RUWĀD API is unreachable right now. Please try again in a moment." />
      </div>
    );
  }
  if (!investor) notFound();
  return <InvestorProfilePage investor={investor} />;
}
