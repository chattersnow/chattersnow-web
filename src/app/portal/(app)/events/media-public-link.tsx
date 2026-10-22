"use client";

import { Copy, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * The event's public gallery link (#1654), shown on the Media card while the
 * gallery has something in it. `url` is absolute when the public site is on
 * another host than the portal, and a path when it is this one, which the
 * browser's own origin completes.
 */
export function MediaPublicLink({ url }: { url: string }) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        new URL(url, window.location.origin).toString(),
      );
      toast.success("Link copied.");
    } catch {
      // Refused in some browsers and on every insecure origin; the link is
      // one click away to copy by hand.
      toast.error("Couldn't copy. Open the gallery and copy its address.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
      <Globe className="app-muted size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        What&rsquo;s marked public is in this event&rsquo;s gallery on the
        public site.
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      >
        View gallery
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
      <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
        <Copy />
        Copy link
      </Button>
    </div>
  );
}
