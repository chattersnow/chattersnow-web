"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  checkArtworkFile,
  uploadArtwork,
  type UploadedArtwork,
} from "@/lib/storage/artwork-submissions";
import { createArtworkUploadSlotsAction } from "@/app/(public)/artwork/[code]/artwork-actions";

export type ArtworkItem = {
  image: UploadedArtwork;
  /** An object URL for the local file -- the bucket is private, so there is
   * nothing to read back, and a preview here costs no round trip. */
  previewUrl: string;
  fileName: string;
};

type ArtworkUploadFieldProps = {
  code: string;
  items: ArtworkItem[];
  onChange: (items: ArtworkItem[]) => void;
  maxImages: number;
  disabled?: boolean;
};

/** What is on the wire right now, for the bar under the picker. */
type UploadProgress = {
  fileName: string;
  /** 1-based, for "2 of 3". */
  index: number;
  count: number;
  /** Null until the first computable progress event -- some proxies never
   * send one, and an indeterminate bar is honest where a stuck 0% is not. */
  fraction: number | null;
};

/**
 * Pick artwork and upload it, on select rather than on submit (#870).
 *
 * Uploading on select is what makes the 10 MB cap workable at all: the file
 * never passes through a Server Action, so it is not subject to Next's 1 MB
 * body limit or Vercel's 4.5 MB one. The Server Action only mints a one-shot
 * signed upload URL, and the browser PUTs to Storage directly.
 *
 * Removing a picture drops it from the form but leaves the object in the
 * bucket -- there is no delete policy for `anon`, deliberately, and giving one
 * would let anybody with a call code delete by path. The daily purge sweeps
 * anything no submission row references.
 */
export function ArtworkUploadField({
  code,
  items,
  onChange,
  maxImages,
  disabled = false,
}: ArtworkUploadFieldProps) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are a document-lifetime allocation until revoked, and this form
  // can churn through several 10 MB files before it is submitted.
  const previews = useRef<Set<string>>(new Set());
  useEffect(() => {
    const held = previews.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  const uploading = progress !== null;
  const remaining = maxImages - items.length;
  const busy = disabled || uploading;

  async function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    setError(null);

    if (picked.length > remaining) {
      setError(
        remaining === 1
          ? "You can add one more image."
          : `You can add ${remaining} more images.`,
      );
      return;
    }

    for (const file of picked) {
      const problem = checkArtworkFile(file);
      if (problem) {
        setError(problem);
        return;
      }
    }

    setProgress({
      fileName: picked[0].name,
      index: 1,
      count: picked.length,
      fraction: null,
    });
    try {
      // Slots first, so a closed call or an exhausted rate limit is reported
      // before the browser spends time encoding several megabytes.
      const slotResult = await createArtworkUploadSlotsAction(
        code,
        picked.map((file) => file.type),
      );
      if ("error" in slotResult) {
        setError(slotResult.error);
        return;
      }

      const added: ArtworkItem[] = [];
      for (const [index, file] of picked.entries()) {
        const slot = slotResult.slots[index];
        if (!slot) break;

        setProgress({
          fileName: file.name,
          index: index + 1,
          count: picked.length,
          fraction: null,
        });

        const result = await uploadArtwork(file, slot, (fraction) =>
          setProgress((current) =>
            // Guarded: a progress event can land after the batch was abandoned
            // for an error, and reviving the bar then would be a lie.
            current && current.fileName === file.name
              ? { ...current, fraction }
              : current,
          ),
        );
        if ("error" in result) {
          setError(result.error);
          break;
        }

        const previewUrl = URL.createObjectURL(file);
        previews.current.add(previewUrl);
        added.push({ image: result.image, previewUrl, fileName: file.name });
      }

      // Whatever made it through is kept: re-picking six files because the
      // fourth failed is a bad trade on a phone.
      if (added.length > 0) onChange([...items, ...added]);
    } finally {
      setProgress(null);
    }
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // Cleared straight away so picking the same file twice in a row still
    // fires a change event.
    event.target.value = "";
    void addFiles(picked);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy || remaining <= 0) return;
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function handleRemove(path: string) {
    const removed = items.find((item) => item.image.path === path);
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
      previews.current.delete(removed.previewUrl);
    }
    setError(null);
    onChange(items.filter((item) => item.image.path !== path));
    inputRef.current?.focus();
  }

  return (
    <Field>
      <FieldLabel htmlFor="artwork-files">Your artwork</FieldLabel>

      {items.length > 0 && (
        <ul className="flex flex-wrap gap-3 pt-1">
          {items.map((item) => (
            <li key={item.image.path} className="w-28">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {/* A local object URL for a file this browser just read, so
                    next/image would add a loader round trip and nothing else. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  className="size-full object-cover"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 w-full"
                disabled={busy}
                onClick={() => handleRemove(item.image.path)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/*
        A drop target wrapped around the picker rather than replacing it.
        Dragging files onto a form is the expected gesture for artwork on a
        desktop, and there was nothing here to drop onto -- but the native
        input stays exactly where it was, for the reasons below. The div takes
        no focus and carries no role: everything it does is reachable through
        the input inside it, so to a keyboard or a screen reader this is
        decoration, which is what a drop zone should be.
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && remaining > 0) setDragging(true);
        }}
        onDragLeave={(event) => {
          // Without the containment check this fires every time the pointer
          // crosses onto a child and the highlight flickers.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={handleDrop}
        data-dragging={dragging || undefined}
        className="flex flex-col gap-2 rounded-lg border border-dashed border-[var(--line)] p-4 transition-colors data-dragging:border-primary data-dragging:bg-primary/5"
      >
        <div className="flex flex-wrap items-center gap-2">
          {/*
            A visible native file input rather than a Button over a hidden one:
            one tab stop, a real <label>, a native focus ring, and nothing for
            axe's aria-hidden-focus rule to catch. Same call as
            PhotoUploadField.
          */}
          <input
            ref={inputRef}
            id="artwork-files"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy || remaining <= 0}
            onChange={handleFiles}
            aria-describedby="artwork-files-help"
            className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <p className="text-xs text-muted-foreground">Or drag them here.</p>
      </div>

      {progress && <UploadBar progress={progress} />}

      <FieldDescription id="artwork-files-help">
        {remaining > 0
          ? `JPEG, PNG or WebP, up to 10 MB each. You can add ${remaining} more.`
          : "That's the most images this call accepts."}
      </FieldDescription>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Field>
  );
}

/**
 * The bar that replaced a bare spinner (#878).
 *
 * `aria-live="polite"` on the label rather than on the bar: the percentage
 * changes many times a second and announcing each one would make the field
 * unusable, whereas "Uploading art.jpg (2 of 3)" changes once per file and is
 * exactly what someone needs to hear.
 */
function UploadBar({ progress }: { progress: UploadProgress }) {
  const percent =
    progress.fraction === null ? null : Math.round(progress.fraction * 100);
  const label =
    progress.count > 1
      ? `Uploading ${progress.fileName} (${progress.index} of ${progress.count})`
      : `Uploading ${progress.fileName}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span aria-live="polite" className="text-muted-foreground">
          {label}
        </span>
        {percent !== null && (
          <span className="tabular-nums text-muted-foreground">{percent}%</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        // Omitted entirely while indeterminate, which is how a progressbar
        // says "running, length unknown" -- a valuenow of 0 would claim no
        // progress rather than no measurement.
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
    </div>
  );
}
