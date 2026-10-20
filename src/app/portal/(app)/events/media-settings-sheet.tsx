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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import { updateEventMediaUploadsEnabledAction } from "./media-actions";

/**
 * This organization's event media setting (#1606), a sheet beside
 * Registration's and for its reason: one switch that shapes one feature does
 * not earn a route. Saved on toggle.
 */
export function MediaSettingsSheet({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setChecked(enabled);
      setError(null);
    }
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
