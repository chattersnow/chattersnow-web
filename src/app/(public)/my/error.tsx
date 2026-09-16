"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

/**
 * Keeps a thrown page in the area inside the tenant's site, the way
 * `portal/(app)/error.tsx` keeps one inside the portal shell (#1179).
 *
 * Worth having here more than on most public sections: every page under `/my`
 * reads Supabase as the person themselves, through RPCs and policies that can
 * fail for reasons a visitor has no way to guess -- a session that expired
 * mid-read, a claim revoked while the page was open. Next's built-in boundary
 * would answer all of that with an unbranded full-page error and no way back.
 *
 * At `/my` rather than per route, because there is one thing to say and one
 * place to send someone whichever of the four threw. It renders its own
 * PageShell for the same reason the loading files do: the area's layout is
 * gate and slot, so the boundary replaces the only `<main>` on the page.
 */
export default function MyError({
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
    Sentry.captureException(error);
  }, [error]);

  return (
    <PageShell maxWidth="max-w-2xl">
      <div className="w-fit">
        <h1 className="brand-display flex items-center gap-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          <TriangleAlert className="size-8 shrink-0 text-[var(--purple)]" />
          Something went wrong
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-4 text-sm leading-relaxed">
        We couldn&apos;t load this part of your account. Nothing you have done
        is lost — try again, or start from your account page.
      </p>
      {error.digest && (
        <p className="app-muted mt-2 text-xs">
          Reference for support: <code>{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset} className="min-h-11 px-4">
          <RotateCcw />
          Try again
        </Button>
        <Button
          variant="secondary"
          nativeButton={false}
          className="min-h-11 px-4"
          render={<Link href={MY_PATH_PREFIX} />}
        >
          Your account
        </Button>
      </div>
    </PageShell>
  );
}
