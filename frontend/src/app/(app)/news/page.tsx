import { NewsEventsPage } from "@/features/news/NewsEventsPage";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Healthcare Innovation News and Events in Saudi Arabia",
  description: "News and upcoming events across the Saudi and MENA healthcare innovation ecosystem, collected on RUWĀD.",
  path: "/news",
});

export default function Page() {
  return <NewsEventsPage />;
}
