"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { artworkCallPath } from "../submission-types";

/**
 * The call's public path, as text.
 *
 * Its own column in the calls table, which is why it is only the path: the
 * copy button lives in the actions column instead, so the one affordance the
 * page exists for survives the widths that drop this column (#1157).
 */
export function CallLinkPath({ code }: { code: string }) {
  return (
    <code className="rounded-md bg-muted px-2 py-1 text-xs">
      {artworkCallPath(code)}
    </code>
  );
}

/**
 * Copies a call's public URL.
 *
 * The origin is read from the browser rather than from NEXT_PUBLIC_SITE_URL:
 * a tenant on a custom domain must share *its* domain, and the page a curator
 * is looking at is already on it (#860).
 */
export function CopyCallLinkButton({
  code,
  title,
}: {
  code: string;
  /** Names the row, so a screen reader hears which call is being copied. */
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  const path = artworkCallPath(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      toast.success("Link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and every insecure
      // origin. The link is on screen and selectable, so this is a
      // convenience failing, not the feature failing.
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy link to ${title}`}
            onClick={copy}
          />
        }
      >
        {copied ? <Check /> : <Copy />}
      </TooltipTrigger>
      <TooltipContent>Copy link</TooltipContent>
    </Tooltip>
  );
}
