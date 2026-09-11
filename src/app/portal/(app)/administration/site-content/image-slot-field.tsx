"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
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
 *
 * The preview is drawn at `ratio`, the aspect the public site crops this slot
 * to, so the editor shows the crop the page will apply: a face that survives a
 * square thumbnail can still lose its head in the team page's 21:9 band. It
 * used to be a `size-24` square that `Field`'s `*:w-full` stretched into a
 * full-width 96px strip, matching no slot on the site at all (#918).
 */
export function ImageSlotField({
  id,
  label,
  ratio,
  value,
  onChange,
}: {
  id: string;
  label: string;
  /** The aspect the public site crops this slot to, as a CSS ratio. */
  ratio: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  // Guarded, not just resolved: the box is typed into a character at a time,
  // and next/image throws the whole page away on a half-typed URL.
  const resolved = resolveImageUrl(value);
  const previewUrl = isRenderableImageSrc(resolved) ? resolved : null;
  // The URL that failed, rather than a flag: a new link deserves a fresh
  // verdict, and comparing is cheaper than resetting a flag from an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = previewUrl !== null && failedUrl === previewUrl;

  return (
    <>
      {/* Sized by height, so the aspect sets the width: a 21:9 hero is a wide
          band and a 3:4 portrait a narrow one, and every slot costs the same
          seven rems of a form that is already thousands of pixels long.
          Nothing is drawn while the box is blank -- there is no crop to judge,
          and a hole under each of eight unset slots is how Get Involved got
          long the first time (#792). The section says once what blank does. */}
      {previewUrl && !failed && (
        // The wrapper is load-bearing: `Field`'s `*:w-full` stretches every
        // direct child, which is what turned the old `size-24` square into a
        // full-width 96px band matching no slot on the site (#918).
        <div>
          <div
            className="relative h-28 w-auto max-w-full overflow-hidden rounded-lg bg-muted"
            style={{ aspectRatio: ratio }}
          >
            <Image
              src={previewUrl}
              // Decorative: the box sits against a labelled field holding the
              // link it previews, and a failed load says so in words below.
              alt=""
              fill
              sizes="256px"
              className="object-cover"
              onError={() => setFailedUrl(previewUrl)}
              // A 7rem preview gains nothing from the optimizer, and the image
              // may sit on a host `next.config.ts` does not list.
              unoptimized
            />
          </div>
        </div>
      )}
      <Input
        id={id}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value.trim() || null)}
      />
      {previewUrl && failed && (
        <FieldDescription className="text-destructive">
          That link did not load as a picture. A Google Drive link has to be a
          file rather than a folder, and shared with anyone who has the link.
        </FieldDescription>
      )}
      {previewUrl && !failed && (
        <FieldDescription>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 underline underline-offset-4"
          >
            Open the full picture
            <span className="sr-only">({label})</span>
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </FieldDescription>
      )}
    </>
  );
}

/** The hint every image slot shares, said once per section rather than per slot. */
export function ImageSlotHint() {
  return (
    <FieldDescription>
      Photos take a Google Drive share link or a direct image URL; blank shows
      the placeholder icon.
    </FieldDescription>
  );
}
