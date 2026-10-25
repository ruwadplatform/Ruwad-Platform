import { notFound } from "next/navigation";
import { AdminAdvisoryPage } from "@/features/advisory/AdminAdvisoryPage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default function Page() {
  if (!ADVISORY_ENABLED) notFound();
  return <AdminAdvisoryPage />;
}
