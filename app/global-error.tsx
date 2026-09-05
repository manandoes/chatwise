"use client";

// The last resort (Phase 14).
//
// `app/error.tsx` catches anything that breaks inside a page. This one catches
// what breaks *outside* one — in the root layout itself. Without it, that case
// falls through to the framework's own error screen, which is a stack trace on
// a white page: exactly what docs/Rules.md §4 forbids.
//
// Because the layout is what failed, this file has to supply its own `<html>`
// and `<body>`, and it cannot rely on anything the layout would have set up.
// So: no shared components, no imported icons, no fonts, and the few colours it
// needs are written in rather than read from the theme. It is deliberately the
// plainest file in the project — a screen that only ever appears when things
// are already going wrong should have nothing left to go wrong in it.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#0a0f0d",
          color: "#f2f5f3",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            ChatWise couldn&rsquo;t load
          </h1>

          <p style={{ marginTop: "0.75rem", color: "#9aa7a1" }}>
            That&rsquo;s on us, not you. Nothing you had saved has been lost.
            Try again, and if it keeps happening, get in touch.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#22e27a",
              color: "#04140b",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: "2rem",
                fontSize: "0.875rem",
                color: "#9aa7a1",
              }}
            >
              If you contact us, quote this:{" "}
              <span style={{ fontFamily: "ui-monospace, monospace", color: "#f2f5f3" }}>
                {error.digest}
              </span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
