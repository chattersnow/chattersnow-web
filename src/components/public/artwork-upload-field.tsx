"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
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
  const [uploading, setUploading] = useState(false);
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

  const remaining = maxImages - items.length;

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // Cleared straight away so picking the same file twice in a row still
    // fires a change event.
    event.target.value = "";
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

    setUploading(true);
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

        const result = await uploadArtwork(file, slot);
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
      setUploading(false);
    }
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
                disabled={disabled || uploading}
                onClick={() => handleRemove(item.image.path)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

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
          disabled={disabled || uploading || remaining <= 0}
          onChange={handleFiles}
          aria-describedby="artwork-files-help"
          className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {uploading && <Spinner aria-label="Uploading artwork" />}
      </div>

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
