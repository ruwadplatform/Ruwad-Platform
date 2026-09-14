import { Suspense } from "react";
import { StartupsDirectoryPage } from "@/features/startups/StartupsDirectoryPage";

export default function Page() {
  return (
    <Suspense>
      <StartupsDirectoryPage />
    </Suspense>
  );
}
