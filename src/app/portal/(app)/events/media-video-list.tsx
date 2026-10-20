"use client";

import { useState } from "react";
import { Download, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { ViewerTime } from "@/components/viewer-time";
import { formatFileSize } from "@/lib/publications";
import { cn } from "@/lib/utils";
import type { EventMediaRow } from "./media-actions";

/**
 * The Media card's videos (#1607): one row each, with who uploaded it and
 * when, play in a dialog, download, and delete for events:manage.
 *
 * Played straight from the original through its signed URL: phone MP4 and
 * MOV play in the browser, and transcoding is out of scope (#1605).
 */
export function MediaVideoList({
  videos,
  timeZone,
  canDelete,
  deletingId,
  onDelete,
}: {
  videos: EventMediaRow[];
  /** The event's zone, until the browser says the viewer's own. */
  timeZone: string;
  canDelete: boolean;
  deletingId: string | null;
  onDelete: (video: EventMediaRow) => void;
}) {
  const [playing, setPlaying] = useState<EventMediaRow | null>(null);

  return (
    <section
      aria-labelledby="event-media-videos"
      className="flex flex-col gap-2"
    >
      <h3 id="event-media-videos" className="text-sm font-semibold">
        Videos <span className="app-muted font-normal">({videos.length})</span>
      </h3>
      <ul className="flex flex-col divide-y divide-[var(--line)] text-sm">
        {videos.map((video) => (
          <li key={video.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p
                className="truncate font-medium"
                title={video.original_filename}
              >
                {video.original_filename}
              </p>
              <p className="app-muted text-xs">
                <span className="tabular-nums">
                  {formatFileSize(video.size_bytes)}
                </span>
                {" · "}
                {video.uploader_name ?? "Unknown uploader"}
                {" · "}
                <ViewerTime iso={video.uploaded_at} fallbackZone={timeZone} />
              </p>
            </div>
            {video.url ? (
              <>
                <TooltipIconButton
                  label={`Play ${video.original_filename}`}
                  onClick={() => setPlaying(video)}
                >
                  <Play />
                </TooltipIconButton>
                {video.download_url && (
                  // A styled anchor: it is a file download, and should behave
                  // as a link (registrants-tab's CSV does the same).
                  <a
                    href={video.download_url}
                    download={video.original_filename}
                    aria-label={`Download ${video.original_filename}`}
                    title={`Download ${video.original_filename}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon-sm" }),
                    )}
                  >
                    <Download />
                  </a>
                )}
              </>
            ) : (
              <span className="app-muted text-xs">Couldn&apos;t load</span>
            )}
            {canDelete && (
              <ConfirmDeleteButton
                label={`Delete ${video.original_filename}`}
                title={`Delete ${video.original_filename}?`}
                description="The video is removed from this event and from storage. This can't be undone."
                pending={deletingId === video.id}
                disabled={deletingId !== null}
                onConfirm={() => onDelete(video)}
              />
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={playing !== null}
        onOpenChange={(open) => {
          if (!open) setPlaying(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {playing?.original_filename}
            </DialogTitle>
          </DialogHeader>
          {playing?.url && (
            <video
              key={playing.id}
              src={playing.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="max-h-[70vh] w-full rounded-md bg-black"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
