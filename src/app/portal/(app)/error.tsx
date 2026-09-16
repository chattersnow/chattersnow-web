"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Keeps a thrown server component inside the portal shell. Without this,
 * Next's built-in boundary takes over the whole document: no sidebar, no
 * branding, no retry, no way back in except editing the URL.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // React error boundaries stop a thrown render from ever reaching
    // window.onerror, so without this call a client-side crash here is
    // invisible to Sentry. Server-side throws are already reported by
    // `onRequestError` in `src/instrumentation.ts`; in production those arrive
    // here redacted to a digest, so the copy Sentry gets from this line is a
    // thin duplicate that groups on its own -- an acceptable trade for not
    // losing client render errors entirely.
    //
    // `error_digest` is what makes the "Reference for support" digest on
    // screen worth showing: Sentry does not index non-standard Error
    // properties, so without a tag the digest a staffer reads out matches
    // nothing searchable (#1195, #1210). The tag lands on this boundary's
    // copy; the full server event for the same failure shares its trace.
    Sentry.captureException(error, {
      tags: error.digest ? { error_digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <div className="max-w-2xl">
      <div className="w-fit">
        <h1 className="brand-display flex items-center gap-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          <TriangleAlert className="size-8 shrink-0 text-[var(--purple)]" />
          Something went wrong
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-4 text-sm leading-relaxed">
        This page couldn&apos;t load. The rest of the portal is still working —
        try again, or head back to the dashboard.
      </p>
      {error.digest && (
        <p className="app-muted mt-2 text-xs">
          Reference for support: <code>{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href="/portal/home" />}
        >
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
