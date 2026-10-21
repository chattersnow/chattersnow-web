"use client";

import { CalendarClock, Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ViewerTime } from "@/components/viewer-time";
import { EVENT_MEDIA_EXPIRY_WARNING_DAYS } from "@/lib/storage/event-media-files";
import { cn } from "@/lib/utils";
import type { EventMediaRow } from "./media-actions";

/**
 * The photos and videos the retention setting deletes within the warning
 * window (#1608), each with its date and a download, so someone can keep a
 * copy before the daily purge removes it. Soonest first.
 */
export function MediaExpiryNotice({
  items,
  timeZone,
}: {
  /** Already filtered to the warning window. */
  items: EventMediaRow[];
  /** The event's zone, until the browser says the viewer's own. */
  timeZone: string;
}) {
  const sorted = [...items].sort((a, b) =>
    (a.expires_at ?? "").localeCompare(b.expires_at ?? ""),
  );

  return (
    <Alert>
      <CalendarClock />
      <AlertTitle>
        {sorted.length === 1
          ? "1 photo or video will be deleted soon"
          : `${sorted.length} photos and videos will be deleted soon`}
      </AlertTitle>
      <AlertDescription>
        <p>
          This organization keeps event media for a set period. These reach it
          within {EVENT_MEDIA_EXPIRY_WARNING_DAYS} days — download anything you
          want to keep.
        </p>
        <ul className="mt-2 flex w-full flex-col divide-y divide-[var(--line)]">
          {sorted.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-medium text-[var(--foreground)]"
                  title={item.original_filename}
                >
                  {item.original_filename}
                </p>
                <p className="text-xs">
                  Deleted after{" "}
                  <ViewerTime iso={item.expires_at} fallbackZone={timeZone} />
                </p>
              </div>
              {item.download_url && (
                <a
                  href={item.download_url}
                  download={item.original_filename}
                  aria-label={`Download ${item.original_filename}`}
                  title={`Download ${item.original_filename}`}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  )}
                >
                  <Download />
                </a>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
