import { Suspense } from "react";
import { SearchResultsPage } from "@/features/search/SearchResultsPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchResultsPage />
    </Suspense>
  );
}
