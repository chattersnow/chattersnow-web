"use client";

import { useEffect } from "react";
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
