"use client";

import Image from "next/image";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";

/**
 * The control for an `image` slot: a link box with the picture it points at.
 *
 * A link rather than an upload, as the System Settings panel it replaces was
 * (#812): the site's photos live in Google Drive, and `PhotoUploadField`
 * uploads into the gear-photos bucket behind the inventory permissions. A
 * blank box is `null`, the slot's default, so "Back to default", the dirty
 * check and the draft that reverts the slot all agree on what empty means.
 */
export function ImageSlotField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  // Guarded, not just resolved: the box is typed into a character at a time,
  // and next/image throws the whole page away on a half-typed URL.
  const resolved = resolveImageUrl(value);
  const previewUrl = isRenderableImageSrc(resolved) ? resolved : null;

  return (
    <>
      {previewUrl && (
        <div className="relative size-24 overflow-hidden rounded-lg bg-muted">
          <Image
            src={previewUrl}
            alt={label}
            fill
            sizes="96px"
            className="object-cover"
            // A 6rem preview gains nothing from the optimizer, and the image
            // may sit on a host `next.config.ts` does not list.
            unoptimized
          />
        </div>
      )}
      <Input
        id={id}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value.trim() || null)}
      />
    </>
  );
}

/** The hint every image slot shares, rendered after the slot's own description. */
export function ImageSlotHint() {
  return (
    <FieldDescription>
      Paste a Google Drive share link or a direct image URL. Leave blank to show
      the placeholder icon.
    </FieldDescription>
  );
}
