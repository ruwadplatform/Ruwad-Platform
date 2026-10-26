import { jsonLdString } from "./rules";

/** Structured data for a page. Only data that is shown on the page (or is plainly true of the site) belongs here; never contact details, scores, or anything behind a sign-in. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
