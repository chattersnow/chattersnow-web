"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import {
  Film,
  ImageIcon,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/publications";
import {
  createEventMediaQueue,
  type EventMediaItem,
  type EventMediaQueue,
  type EventMediaQueueDeps,
} from "@/lib/storage/event-media-queue";

/**
 * What the file picker offers. HEIC/HEIF and .mov are named by extension too,
 * because several browsers report them with no MIME type at all.
 */
const ACCEPT =
  "image/*,video/mp4,video/quicktime,video/webm,.heic,.heif,.mov,.mp4,.m4v,.webm";

const STATUS_LABELS: Record<EventMediaItem["status"], string> = {
  queued: "Waiting",
  uploading: "Uploading",
  paused: "Paused",
  failed: "Failed",
  done: "Uploaded",
};

/**
 * Picks and uploads photos and videos (#1606), several at once, each with its
 * own progress. A video can be paused, and a failed one resumes from where it
 * stopped rather than starting over.
 *
 * Shared by the event's Media card and the upload-link page (#1620), which
 * differ only in `deps`: where slots come from, how a finished file is
 * recorded, and whether it can be taken back. `deps` is read once, on mount.
 */
export function MediaUploader({
  deps,
  hint,
  disabled = false,
  onUploaded,
}: {
  deps: EventMediaQueueDeps;
  hint: React.ReactNode;
  /** Holds the picker shut, e.g. until the rights box is ticked. */
  disabled?: boolean;
  onUploaded?: () => void;
}) {
  const [queue] = useState<EventMediaQueue>(() => createEventMediaQueue(deps));
  const items = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // The list below the uploader reloads as each file is recorded.
  const doneCount = items.filter((item) => item.status === "done").length;
  useEffect(() => {
    if (doneCount > 0) onUploaded?.();
  }, [doneCount, onUploaded]);

  // Leaving the page drops every request in flight; say so first.
  const busy = items.some(
    (item) => item.status === "uploading" || item.status === "queued",
  );
  useEffect(() => {
    if (!busy) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Cleared so picking the same file again (after a dismiss) still fires.
    event.target.value = "";
    if (files.length > 0) void queue.add(files);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          Upload photos &amp; videos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          // Hidden: the button above is the control people reach.
          className="hidden"
          aria-label="Choose photos and videos to upload"
          onChange={handlePick}
        />
        <p className="app-muted text-xs">{hint}</p>
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} queue={queue} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadRow({
  item,
  queue,
}: {
  item: EventMediaItem;
  queue: EventMediaQueue;
}) {
  const percent =
    item.progress === null ? null : Math.round(item.progress * 100);
  const showBar = item.status === "uploading" || item.status === "paused";
  const KindIcon = item.kind === "video" ? Film : ImageIcon;

  return (
    <li
      className="flex flex-col gap-1.5 rounded-lg border border-[var(--line)] p-3"
      data-status={item.status}
    >
      <div className="flex items-center gap-2 text-sm">
        <KindIcon className="app-muted size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate" title={item.name}>
          {item.name}
        </span>
        <span className="app-muted shrink-0 text-xs tabular-nums">
          {formatFileSize(item.size)}
        </span>
        <span
          className={
            item.status === "failed"
              ? "shrink-0 text-xs text-destructive"
              : "app-muted shrink-0 text-xs"
          }
          aria-live="polite"
        >
          {STATUS_LABELS[item.status]}
          {showBar && percent !== null ? ` ${percent}%` : ""}
        </span>
        {item.kind === "video" && item.status === "uploading" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Pause ${item.name}`}
            onClick={() => queue.pause(item.id)}
          >
            <Pause className="size-4" />
          </Button>
        )}
        {item.status === "paused" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Resume ${item.name}`}
            onClick={() => queue.resume(item.id)}
          >
            <Play className="size-4" />
          </Button>
        )}
        {item.status === "failed" && item.retryable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Retry ${item.name}`}
            onClick={() => queue.retry(item.id)}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
        {item.removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.name}`}
            onClick={() => void queue.remove(item.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        {(item.status === "done" || item.status === "failed") && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss ${item.name}`}
            onClick={() => queue.dismiss(item.id)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {showBar && (
        <div
          role="progressbar"
          aria-label={`Uploading ${item.name}`}
          // Omitted while indeterminate, as on the artwork upload field.
          aria-valuenow={percent ?? undefined}
          aria-valuemin={percent === null ? undefined : 0}
          aria-valuemax={percent === null ? undefined : 100}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={
              percent === null
                ? "h-full w-1/3 animate-pulse rounded-full bg-primary"
                : "h-full rounded-full bg-primary transition-[width] duration-200"
            }
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
      )}
      {item.error && <p className="text-xs text-destructive">{item.error}</p>}
    </li>
  );
}
