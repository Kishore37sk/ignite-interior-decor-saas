"use client";

/**
 * Last-resort boundary when the root layout itself fails. It replaces the whole
 * document, so it renders its own <html>/<body> and uses inline styles only
 * (global CSS may not be available).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F6F4",
          color: "#14211C",
          fontFamily:
            "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: 16,
        }}
      >
        <main
          style={{
            maxWidth: 420,
            width: "100%",
            background: "#FFFFFF",
            border: "1px solid #ECEEEA",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(16,24,20,.04), 0 4px 16px rgba(16,24,20,.04)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: "#1A7F63" }}>
            IGNITE INTERIOR DECOR
          </p>
          <h1 style={{ margin: "12px 0 8px", fontSize: 24 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: "#5E6D66", lineHeight: 1.6 }}>
            The portal couldn&apos;t load. Please try again in a moment.
            {error.digest ? ` (Reference: ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              height: 44,
              padding: "0 20px",
              border: 0,
              borderRadius: 12,
              background: "#1A7F63", // --color-primary (AA with white text)
              color: "#FFFFFF",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
