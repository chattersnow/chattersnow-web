"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Images } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import {
  EVENT_MEDIA_EXPIRY_WARNING_DAYS,
  EVENT_MEDIA_RETENTION_PRESETS,
  eventMediaRetentionLabel,
} from "@/lib/storage/event-media-files";
import {
  updateEventMediaRetentionAction,
  updateEventMediaUploadsEnabledAction,
} from "./media-actions";

/** Select values are strings; this one stands for null. */
const INDEFINITELY = "indefinitely";

function retentionValue(days: number | null): string {
  return days === null ? INDEFINITELY : String(days);
}

/**
 * This organization's event media settings (#1606, #1608), a sheet beside
 * Registration's and for its reason: two settings that shape one feature do
 * not earn a route. Each saves as soon as it changes.
 */
export function MediaSettingsSheet({
  enabled,
  retentionDays,
}: {
  enabled: boolean;
  /** Null keeps media indefinitely. */
  retentionDays: number | null;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [retention, setRetention] = useState(retentionValue(retentionDays));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRetentionPending, startRetentionTransition] = useTransition();

  // A period set before the presets changed still shows as itself.
  const periods =
    retentionDays === null ||
    EVENT_MEDIA_RETENTION_PRESETS.includes(retentionDays)
      ? EVENT_MEDIA_RETENTION_PRESETS
      : [...EVENT_MEDIA_RETENTION_PRESETS, retentionDays].sort((a, b) => a - b);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setChecked(enabled);
      setRetention(retentionValue(retentionDays));
      setError(null);
    }
  }

  function handleRetentionChange(next: string | null) {
    if (!next || next === retention) return;
    const previous = retention;
    const days = next === INDEFINITELY ? null : Number(next);
    setError(null);
    setRetention(next);
    startRetentionTransition(async () => {
      const outcome = await runAction(
        () => updateEventMediaRetentionAction(days),
        {
          success:
            days === null
              ? "Event photos and videos are kept indefinitely."
              : `Event photos and videos are kept ${eventMediaRetentionLabel(days).toLowerCase()}.`,
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
      if (!outcome.ok) setRetention(previous);
    });
  }

  function handleChange(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const outcome = await runAction(
        () => updateEventMediaUploadsEnabledAction(next),
        {
          success: next
            ? "Event photo and video uploads are on."
            : "Event photo and video uploads are off.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
      if (!outcome.ok) setChecked(!next);
    });
  }

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <Images className="size-4" />
        Media
      </SheetTrigger>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle>Media</SheetTitle>
          <SheetDescription>
            Photos and videos taken at events, for every event.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="event-media-uploads-label" className="text-sm font-medium">
                Event media uploads
              </p>
              <p
                id="event-media-uploads-help"
                className="app-muted mt-1 text-sm"
              >
                Lets event staff upload photos and videos on each event&rsquo;s
                Media card. Videos are large, so storage grows quickly. Turning
                it off hides the upload button; what was already uploaded stays.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isPending && <Spinner className="size-4" />}
              <Switch
                checked={checked}
                onCheckedChange={handleChange}
                disabled={isPending}
                aria-labelledby="event-media-uploads-label"
                aria-describedby="event-media-uploads-help"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p id="event-media-retention-label" className="text-sm font-medium">
              Keep photos and videos
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={retention}
                onValueChange={handleRetentionChange}
                disabled={isRetentionPending}
              >
                <SelectTrigger
                  className="w-full"
                  aria-labelledby="event-media-retention-label"
                  aria-describedby="event-media-retention-help"
                >
                  <SelectValue>
                    {(value: string) =>
                      eventMediaRetentionLabel(
                        value === INDEFINITELY ? null : Number(value),
                      )
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INDEFINITELY}>
                    {eventMediaRetentionLabel(null)}
                  </SelectItem>
                  {periods.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {eventMediaRetentionLabel(days)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isRetentionPending && <Spinner className="size-4" />}
            </div>
            <p id="event-media-retention-help" className="app-muted text-sm">
              After this, an event&rsquo;s photos and videos are deleted for
              good. Each event&rsquo;s Media card lists what will be deleted in
              the next {EVENT_MEDIA_EXPIRY_WARNING_DAYS} days so it can be
              downloaded first, and nothing is deleted sooner than{" "}
              {EVENT_MEDIA_EXPIRY_WARNING_DAYS} days after this setting changes
              or a file is uploaded.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
