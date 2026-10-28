import { privateMetadata } from "@/lib/seo/metadata";

/** Not for search engines: a signed-in, personal, administrative or tool page. */
export const metadata = privateMetadata("My profile");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
