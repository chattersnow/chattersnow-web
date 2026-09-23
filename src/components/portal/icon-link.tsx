"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LinkPendingPulse } from "@/components/link-pending";

/**
 * A row-level icon-only link (e.g. "View Ada Lovelace") with the tooltip
 * every icon-only control carries. A client component only because the
 * tooltip is one, so server-rendered lists can use it without becoming
 * client components themselves. The icon is passed as rendered children
 * (`<Eye />`), which crosses the server/client boundary fine. It is a Link
 * styled as a button rather than a Button rendering a Link, so it keeps the
 * link role: a Button with `nativeButton={false}` adds `role="button"`.
 */
export function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  /** Accessible name and tooltip text, e.g. `View ${name}`. */
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            // Keeps the mobile shell's icon tap target (globals.css).
            data-size="icon-sm"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          />
        }
      >
        <LinkPendingPulse>{children}</LinkPendingPulse>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
