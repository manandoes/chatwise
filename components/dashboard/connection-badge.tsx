// Whether the customer's WhatsApp number is actually connected right now.
//
// Always a coloured dot AND words — colour is never the only signal
// (Design.md §8), and the wording is plain rather than a status code
// (docs/Rules.md §7).

import Link from "next/link";

const STATUS_TEXT: Record<string, { label: string; dot: string; tone: string }> = {
  CONNECTED: { label: "Connected", dot: "bg-primary shadow-glow", tone: "text-text-primary" },
  CONNECTING: { label: "Connecting…", dot: "bg-warning", tone: "text-text-secondary" },
  RECONNECTING: { label: "Reconnecting…", dot: "bg-warning", tone: "text-text-secondary" },
  NOT_CONNECTED: { label: "Not connected yet", dot: "bg-warning", tone: "text-text-secondary" },
  DISCONNECTED: { label: "Disconnected", dot: "bg-error", tone: "text-text-primary" },
  ERROR: { label: "Needs attention", dot: "bg-error", tone: "text-text-primary" },
};

export function ConnectionBadge({
  connection,
}: {
  connection: { type: "QR" | "API"; status: string } | null;
}) {
  if (!connection) return null;

  const state = STATUS_TEXT[connection.status] ?? STATUS_TEXT.NOT_CONNECTED;

  return (
    <Link
      href="/dashboard/connect-whatsapp"
      className="block rounded-md border border-border bg-background p-3 transition-colors hover:border-text-disabled"
    >
      <p className="text-label uppercase text-text-disabled">WhatsApp</p>

      <p className={`mt-1.5 flex items-center gap-2 text-small ${state.tone}`}>
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${state.dot}`} />
        {state.label}
      </p>

      <p className="mt-1 text-text-secondary text-[0.6875rem]">
        {connection.type === "QR" ? "QR connection" : "Business API"}
      </p>
    </Link>
  );
}
