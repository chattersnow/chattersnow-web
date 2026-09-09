"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { artworkCallPath } from "../submission-types";

/**
 * The call's public URL, with a copy button.
 *
 * The origin is read from the browser rather than from NEXT_PUBLIC_SITE_URL:
 * a tenant on a custom domain must share *its* domain, and the page a curator
 * is looking at is already on it (#860).
 */
export function ShareLink({ code }: { code: string }) {
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
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-md bg-muted px-2 py-1 text-sm break-all">
        {path}
      </code>
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        Copy link
      </Button>
    </div>
  );
}
