"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/publications";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { getEventMediaAction, type EventMediaState } from "./media-actions";
import { EventMediaUploader } from "./event-media-uploader";

/**
 * An event's photos and videos (#1606): the upload control, while the
 * organization has uploads on and the reader may upload here, and a list of
 * what is stored. The gallery and player are #1607's.
 */
export function MediaTab({ eventId }: { eventId: string }) {
  const [state, setState] = useState<EventMediaState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    getEventMediaAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setState(result.data);
      }
    });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  useRegisterTabRefresh<TabValue>("media", load);

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!state) return <TabLoadingSkeleton />;

  const showUploader = state.enabled && state.canUpload;

  return (
    <div className="flex flex-col gap-4">
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
        <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
          {state.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                {item.original_filename}
              </span>
              <span className="app-muted shrink-0 text-xs capitalize">
                {item.kind}
              </span>
              <span className="app-muted shrink-0 text-xs tabular-nums">
                {formatFileSize(item.size_bytes)}
              </span>
              <span className="app-muted hidden shrink-0 text-xs sm:inline">
                {formatDateTime(item.uploaded_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
