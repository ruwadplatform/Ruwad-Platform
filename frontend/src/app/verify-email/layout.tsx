import { privateMetadata } from "@/lib/seo/metadata";

/** Not for search engines: a personal, one-time page. */
export const metadata = privateMetadata("Verify your email");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
