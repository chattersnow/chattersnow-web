"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary: the only thing that catches a throw in the root or
 * portal layout, both of which run Supabase queries. It replaces the whole
 * document, so it can't use the app's fonts or providers -- keep it to plain
 * markup and the design tokens from globals.css.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--background)] p-8 text-center text-[var(--foreground)]">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Chatter Snow is having a moment
        </h1>
        <p className="max-w-md text-sm leading-relaxed opacity-80">
          Something went wrong while loading the page. Try again — if it keeps
          happening, let an administrator know.
        </p>
        {error.digest && (
          <p className="text-xs opacity-60">
            Reference for support: <code>{error.digest}</code>
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-2 rounded-full bg-[var(--purple)] px-5 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
