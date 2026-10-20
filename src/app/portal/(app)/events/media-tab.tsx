"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CameraOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { runAction } from "@/components/portal/action-toast";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { ViewerTime } from "@/components/viewer-time";
import { formatFileSize } from "@/lib/publications";
import {
  eventMediaExpiresSoon,
  eventMediaRetentionLabel,
} from "@/lib/storage/event-media-files";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import {
  deleteEventMediaAction,
  getEventMediaAction,
  type EventMediaRow,
  type EventMediaState,
} from "./media-actions";
import { EventMediaUploader } from "./event-media-uploader";
import { MediaExpiryNotice } from "./media-expiry-notice";
import { MediaPhotoGrid } from "./media-photo-grid";
import { MediaVideoList } from "./media-video-list";

/** formatFileSize rounds anything under a KB up to "1 KB"; nothing is nothing. */
function storageSize(bytes: number): string {
  return bytes > 0 ? formatFileSize(bytes) : "0 MB";
}

/**
 * An event's photos and videos (#1606, #1607, #1608): the upload control,
 * while the organization has uploads on and the reader may upload here; the
 * photo-objection notice; what the retention setting deletes soon; then the
 * photo gallery and the video list; how much storage the event and the
 * organization use, and how long this event's media is kept.
 */
export function MediaTab({
  eventId,
  eventName,
  timeZone,
}: {
  eventId: string;
  eventName: string;
  timeZone: string;
}) {
  const [state, setState] = useState<EventMediaState | null>(null);
  // When `state` was read, which "expires soon" is measured from: a clock read
  // during render would differ between renders.
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    getEventMediaAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setState(result.data);
        setLoadedAt(new Date());
      }
    });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  useRegisterTabRefresh<TabValue>("media", load);

  function handleDelete(item: EventMediaRow) {
    setDeletingId(item.id);
    startTransition(async () => {
      await runAction(() => deleteEventMediaAction(item.id), {
        success: `${item.original_filename} deleted.`,
        onSuccess: load,
      });
      setDeletingId(null);
    });
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!state || !loadedAt) return <TabLoadingSkeleton />;

  const showUploader = state.enabled && state.canUpload;
  const photos = state.items.filter((item) => item.kind === "photo");
  const videos = state.items.filter((item) => item.kind === "video");
  const expiring = state.items.filter((item) =>
    eventMediaExpiresSoon(item.expires_at, loadedAt),
  );

  return (
    <div className="flex flex-col gap-4">
      {state.photoObjections > 0 && (
        <Alert>
          <CameraOff />
          <AlertTitle>Photo objections at this event</AlertTitle>
          <AlertDescription>
            {state.photoObjections === 1
              ? "1 person at this event objected to being photographed"
              : `${state.photoObjections} people at this event objected to being photographed`}{" "}
            — check photos and footage before sharing them outside the portal.
          </AlertDescription>
        </Alert>
      )}
      {expiring.length > 0 && (
        <MediaExpiryNotice items={expiring} timeZone={timeZone} />
      )}
      {showUploader && (
        <EventMediaUploader eventId={eventId} onUploaded={load} />
      )}
      {state.items.length === 0 ? (
        <EmptyState
          title="No photos or videos yet"
          description={
            !state.enabled
              ? "Event media uploads are turned off for this organization. Someone who manages events can turn them on from the Media button on the Events page."
              : showUploader
                ? "Upload what was taken at this event so it stays with the event."
                : "Event staff can upload what was taken at this event."
          }
        />
      ) : (
        <>
          {photos.length > 0 && (
            <MediaPhotoGrid
              photos={photos}
              eventName={eventName}
              canDelete={state.canDelete}
              deletingId={deletingId}
              onDelete={handleDelete}
            />
          )}
          {videos.length > 0 && (
            <MediaVideoList
              videos={videos}
              timeZone={timeZone}
              canDelete={state.canDelete}
              deletingId={deletingId}
              onDelete={handleDelete}
            />
          )}
        </>
      )}
      <p className="app-muted text-xs">
        Storage: {storageSize(state.eventBytes)} for this event,{" "}
        {storageSize(state.tenantBytes)} for all of this organization&apos;s
        event media.{" "}
        {state.retentionDays === null ? (
          "Kept indefinitely."
        ) : (
          <>
            Kept {eventMediaRetentionLabel(state.retentionDays).toLowerCase()}
            {state.eventExpiresAt && (
              <>
                , until{" "}
                <ViewerTime
                  iso={state.eventExpiresAt}
                  fallbackZone={timeZone}
                />
              </>
            )}
            .
          </>
        )}
      </p>
    </div>
  );
}
