"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { FieldDescription } from "@/components/ui/field";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import { cn } from "@/lib/utils";

/**
 * A URL's state as a preview: whether it can be drawn at all, and whether the
 * browser has since said it is not a picture.
 *
 * Guarded rather than merely resolved, because a link box is typed into a
 * character at a time and `next/image` throws the whole page away on a
 * half-typed URL. The URL that failed is remembered rather than a flag, so a
 * new link gets a fresh verdict without resetting anything from an effect.
 *
 * Shared by the two controls that preview a photo: an `image` slot's own link
 * box, and a team member's one photo control (#922).
 */
export function useImagePreview(value: string | null): {
  /** Renderable and not known-broken, or null: nothing to draw. */
  url: string | null;
  failed: boolean;
  markFailed: () => void;
} {
  const resolved = resolveImageUrl(value);
  const candidate = isRenderableImageSrc(resolved) ? resolved : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = candidate !== null && failedUrl === candidate;
  return {
    url: failed ? null : candidate,
    failed,
    markFailed: () => setFailedUrl(candidate),
  };
}

/**
 * The picture itself, drawn at the aspect the public site crops it to, so the
 * editor shows the crop the page will apply: a face that survives a square
 * thumbnail can still lose its head in the team page's 21:9 band.
 *
 * Sized by height by default, so the aspect sets the width and every slot
 * costs the same seven rems of a form that is already thousands of pixels
 * long (#918). `className` overrides that where the picture is the point
 * rather than a thumbnail beside a link box -- the publish dialog gives each
 * of its two pictures half the width instead (#923).
 */
export function ImagePreviewBox({
  url,
  ratio,
  onError,
  className,
}: {
  url: string;
  /** The aspect the public site crops this picture to, as a CSS ratio. */
  ratio: string;
  onError: () => void;
  /** Sizing for the box itself, merged over the default `h-28 w-auto`. */
  className?: string;
}) {
  return (
    // The wrapper is load-bearing: `Field`'s `*:w-full` stretches every direct
    // child, which is what turned the old `size-24` square into a full-width
    // 96px band matching no slot on the site (#918).
    <div>
      <div
        className={cn(
          "relative h-28 w-auto max-w-full overflow-hidden rounded-lg bg-muted",
          className,
        )}
        style={{ aspectRatio: ratio }}
      >
        <Image
          src={url}
          // Decorative: the box sits against a labelled field holding the link
          // it previews, and a failed load says so in words below.
          alt=""
          fill
          sizes="256px"
          className="object-cover"
          onError={onError}
          // A 7rem preview gains nothing from the optimizer, and the image may
          // sit on a host `next.config.ts` does not list.
          unoptimized
        />
      </div>
    </div>
  );
}

/** The way out of a 7rem thumbnail: the picture at its own size, in a new tab. */
export function OpenPictureLink({
  url,
  label,
}: {
  url: string;
  /** What this picture is, for a link whose text repeats on the page. */
  label: string;
}) {
  return (
    <FieldDescription>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 underline underline-offset-4"
      >
        Open the full picture
        <span className="sr-only">({label})</span>
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </FieldDescription>
  );
}
