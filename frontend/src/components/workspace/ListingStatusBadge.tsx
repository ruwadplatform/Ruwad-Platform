import type { ListingStatus } from "@/lib/store";

const CLASS: Record<ListingStatus, string> = {
  Published: "badge-good", Draft: "badge-neutral", "Under Review": "badge-info", "Changes Requested": "badge-warn",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <span className={`badge ${CLASS[status]}`}>{status}</span>;
}
