import { notFound } from "next/navigation";
import { MyConsultationsPage } from "@/features/advisory/MyConsultationsPage";
import { ADVISORY_ENABLED } from "@/lib/feature-flags";

export default function Page() {
  if (!ADVISORY_ENABLED) notFound();
  return <MyConsultationsPage />;
}
