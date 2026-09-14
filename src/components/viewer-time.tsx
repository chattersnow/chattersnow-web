"use client";

import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { formatDateTimeInZone, DATE_TIME_WITH_ZONE } from "@/lib/time";
import { EMPTY_VALUE } from "@/lib/format";

/**
 * An instant, shown in the viewer's own timezone and saying which one that is.
 *
 * Two halves of #1057 meet here. The portal displays instants in the viewer's
 * zone -- which a server component cannot do, since it would format in the
 * server's zone (UTC on Vercel) -- and every displayed time has to name its
 * zone, so a reader never has to work out whose clock a bare "5:00 PM" is on.
 *
 * `fallbackZone` is what the server renders, and every caller must choose it
 * rather than inherit a default, because the honest answer differs by surface:
 *
 * - Inside an event, pass the event's own `timezone`. It is nearly always the
 *   viewer's too, so the first paint is usually already right and there is
 *   nothing to correct.
 * - Everywhere else, pass "UTC". The label makes that honest for the moment it
 *   is on screen, which beats the status quo of showing UTC *unlabelled and
 *   permanently*.
 *
 * The `<time dateTime>` wrapper keeps the machine-readable instant in the
 * markup whatever zone the text ends up in, which is what a crawler, a
 * screen reader's date announcement and a copy-paste all want.
 */
export function ViewerTime({
  iso,
  fallbackZone,
  options = DATE_TIME_WITH_ZONE,
  className,
}: {
  /** The stored instant, as an ISO string. Null renders the em dash, so a
   *  nullable column does not need a ternary at every call site. */
  iso: string | null | undefined;
  /** The zone to render in until the browser has told us its own. */
  fallbackZone: string;
  /** Defaults to date, time and the short zone name. */
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const viewerZone = useViewerTimeZone();

  // No instant, nothing to put in `dateTime` -- and an empty `<time>` is
  // invalid, so this returns the placeholder bare.
  if (!iso) return <>{EMPTY_VALUE}</>;

  return (
    <time dateTime={iso} className={className}>
      {formatDateTimeInZone(iso, viewerZone ?? fallbackZone, options, "en-US")}
    </time>
  );
}
