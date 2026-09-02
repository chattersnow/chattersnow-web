"use client";

import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pulses its content while the enclosing `<Link>` navigation is pending.
 * Same-route searchParams navigations never re-trigger `loading.tsx`, so
 * this is the inline GET feedback for sort/pagination/row links (#482).
 * Must be rendered as a descendant of a `next/link` `<Link>`.
 */
export function LinkPendingPulse({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex items-center gap-1",
        pending && "animate-pulse opacity-60",
        className,
      )}
    >
      {children}
    </span>
  );
}
