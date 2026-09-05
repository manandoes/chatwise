// What fills the dashboard while a screen is being worked out (Phase 14).
//
// Every dashboard screen is rendered on the server and several of them ask the
// database three or four questions before they can say anything. Without this
// file, clicking a link left the old page sitting there with nothing happening
// — which reads as a click that didn't register, and gets clicked again.
//
// The shell (sidebar, top bar) is already on screen and stays put; only this
// part is replaced. Deliberately shaped like the page headers and cards it
// stands in for, so the layout doesn't jump when the real content lands.

export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="space-y-3">
        <div className="h-8 w-52 animate-pulse rounded-md bg-surface-elevated" />
        <div className="h-4 w-full max-w-[46ch] animate-pulse rounded bg-surface-elevated" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>

      <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}
