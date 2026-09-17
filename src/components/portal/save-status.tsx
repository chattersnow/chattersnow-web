"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/use-autosave";

/**
 * A quiet line, not a toast (#1200).
 *
 * `runAction` announces an outcome once, which is what a Save button wants. An
 * autosave settles every time the typing pauses, so the same treatment would
 * stack toasts over the form being typed into. This is the escape hatch
 * `timezone-panel.tsx` already reaches for -- inline status next to the
 * control -- with a polite live region so the save is announced to a screen
 * reader without stealing focus or interrupting dictation.
 */

/**
 * Safe as a module constant with no `timeZone`, unlike the formatters in
 * `lib/format.ts`: nothing here is server-rendered. The clock only appears
 * once a save has settled, which can only have happened in the browser, so the
 * zone it resolves to is always the viewer's own.
 */
const clockTime = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

export function SaveStatusLine({
  status,
  lastSavedAt,
  className,
}: {
  status: SaveStatus;
  lastSavedAt: number | null;
  className?: string;
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "app-muted flex items-center gap-1.5 text-xs",
        status === "error" && "text-destructive",
        className,
      )}
    >
      {status === "saving" && (
        <>
          <Spinner className="size-3" /> Saving…
        </>
      )}
      {status === "saved" &&
        lastSavedAt !== null &&
        `Saved ${clockTime.format(lastSavedAt)}`}
      {status === "error" && "Couldn't save — retrying"}
    </p>
  );
}
