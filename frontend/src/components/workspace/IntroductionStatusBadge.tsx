const CLASS: Record<string, string> = {
  Pending: "badge-neutral", "In Review": "badge-info", Accepted: "badge-good", Declined: "badge-crit", Completed: "badge-gold",
};

export function IntroductionStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${CLASS[status] ?? "badge-neutral"}`}>{status}</span>;
}
