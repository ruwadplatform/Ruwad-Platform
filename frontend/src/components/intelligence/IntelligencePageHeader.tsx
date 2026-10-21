import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

/** Kept so the ~35 pages that already import it keep working; it is now just the shared PageHeader. */
export function IntelligencePageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <PageHeader title={title} description={description} action={action} />;
}
