"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  MAX_ZOOM,
  aspectRatioValue,
  cropBoxStyle,
  cropObjectPosition,
  cropZoom,
  fitCrop,
  parseImageCrop,
  withImageCrop,
  type ImageCrop,
} from "@/lib/image-crop";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import { cn } from "@/lib/utils";

/**
 * Zoom is offered as a whole percentage -- 100 to 400 in fives -- rather than
 * as 1 to 4 in 0.05s.
 *
 * Not cosmetic. `20 * 0.05` is `1.0000000000000002`, so a slider carrying that
 * as its value is a step mismatch, which makes it `:invalid`, which makes the
 * whole form invalid, which makes the Website editor's "Save draft" button do
 * nothing at all with no error anywhere. An integer scale has no such value.
 */
const ZOOM_PERCENT_STEP = 5;

/** Below this an axis has no room to move and its slider is switched off rather than left doing nothing. */
const SLACK_EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameRect(a: ImageCrop, b: ImageCrop): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Sets the crop stored on a site photo, by moving the picture inside the frame
 * the public site will crop it to.
 *
 * The portal has previewed a photo at its published aspect since #918 --
 * precisely because "a face that survives a square thumbnail can still lose
 * its head in the team page's 21:9 band" -- but the preview was read-only, so
 * an editor could see the problem and could do nothing about it here. This
 * turns that preview into the control: the picture dragged is the picture the
 * page renders.
 *
 * **The sliders are the state and the drag is sugar over them.** A native
 * `<input type="range">` is keyboard- and screen-reader-operable with no
 * primitive to add and no `aria-valuenow` bookkeeping to get wrong, and it
 * means the control has no key handling, no roving focus and no pointer path
 * that a keyboard user is missing. Dragging writes to the same values.
 *
 * Nothing is held locally except the natural size: the crop shown is the crop
 * on `url`, and every gesture emits a whole new stored string. That is what
 * keeps a crop edit an ordinary change to a slot's value, so the dirty check,
 * "Back to default", the draft, the publish dialog and the audit trail all
 * keep working with no change of their own (#1250).
 */
export function ImageCropField({
  url,
  ratio,
  label,
  onChange,
  onError,
  className,
}: {
  /** The stored string, crop fragment and all. */
  url: string | null;
  /** The aspect the public site crops this picture to, as a CSS ratio. */
  ratio: string;
  /** What this picture is, for the group's accessible name. */
  label: string;
  /** Hands back the whole stored string, crop fragment and all. */
  onChange: (url: string) => void;
  /** Called when the browser says the link is not a picture, as `ImagePreviewBox` does. */
  onError?: () => void;
  className?: string;
}) {
  const { src: stored, crop } = parseImageCrop(url);
  const resolved = resolveImageUrl(stored);
  const src = isRenderableImageSrc(resolved) ? resolved : null;

  // Keyed by the src it was measured from, so a new photo is "not measured
  // yet" without an effect resetting anything.
  const [natural, setNatural] = useState<{
    src: string;
    width: number;
    height: number;
  } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  if (!stored || !src) return null;

  const bare: string = stored;
  const measured = natural?.src === src ? natural : null;
  // Zero, not one, when the picture has not loaded: `fitCrop` and `cropZoom`
  // both treat a non-positive aspect as square, and this way there is exactly
  // one place that decision is made.
  const imageAspect =
    measured && measured.height > 0 ? measured.width / measured.height : 0;
  const target = aspectRatioValue(ratio);

  // The rect a plain `object-cover` draws: zoom 1, dead centre. It is what
  // "no crop" means, so emitting it stores no fragment at all.
  const base = fitCrop(imageAspect, target, 1, 0.5, 0.5);
  const rect = crop ?? base;
  // Snapped to the slider's own step, so the number under the thumb is one the
  // control can be put back on with the arrow keys.
  const zoomPercent =
    Math.round(
      clamp(crop ? cropZoom(crop, imageAspect, target) : 1, 1, MAX_ZOOM) *
        (100 / ZOOM_PERCENT_STEP),
    ) * ZOOM_PERCENT_STEP;
  const zoom = zoomPercent / 100;

  const slackX = 1 - rect.w;
  const slackY = 1 - rect.h;
  const movableX = slackX > SLACK_EPSILON;
  const movableY = slackY > SLACK_EPSILON;

  /** Every gesture ends here: a whole rect, and a whole stored string back out. */
  function move(nextZoom: number, cx: number, cy: number) {
    const next = fitCrop(imageAspect, target, nextZoom, cx, cy);
    onChange(withImageCrop(bare, sameRect(next, base) ? null : next));
  }

  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const last = drag.current;
    if (!last) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // The frame shows `w` of the picture's width, so a pointer that crosses
    // the frame moves the rect by `w` -- which is what makes the picture keep
    // up with the finger at every zoom.
    const dx = ((event.clientX - last.x) / box.width) * rect.w;
    const dy = ((event.clientY - last.y) / box.height) * rect.h;
    drag.current = { x: event.clientX, y: event.clientY };
    move(zoom, centreX - dx, centreY - dy);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** An axis as a percentage of the room it has, which is what the slider offers. */
  function position(offset: number, slack: number): number {
    return slack > SLACK_EPSILON ? Math.round((offset / slack) * 100) : 50;
  }

  /** Back the other way: a percentage of the room available, as a centre point. */
  function centreAt(percent: number, size: number, slack: number): number {
    return (percent / 100) * slack + size / 2;
  }

  const image = (
    <Image
      src={src}
      // Decorative: the group is named after the picture, and the field beside
      // it holds the link this previews.
      alt=""
      fill
      sizes="256px"
      className="object-cover"
      style={crop ? { objectPosition: cropObjectPosition(crop) } : undefined}
      // Otherwise the browser's own image drag starts on the first pixel of
      // movement and the crop never moves at all.
      draggable={false}
      onError={onError}
      onLoad={(event) => {
        const loaded = event.currentTarget;
        if (loaded.naturalWidth > 0) {
          setNatural({
            src,
            width: loaded.naturalWidth,
            height: loaded.naturalHeight,
          });
        }
      }}
      // A 7rem preview gains nothing from the optimizer, and the image may sit
      // on a host `next.config.ts` does not list.
      unoptimized
    />
  );

  return (
    <div
      role="group"
      aria-label={`Crop of ${label}`}
      className={cn("space-y-2", className)}
    >
      <div
        className="relative h-28 w-auto max-w-full cursor-grab touch-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing"
        style={{ aspectRatio: ratio }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Without a crop the frame holds the picture directly, exactly as
            `ImagePreviewBox` and `SiteImage` do: an uncropped photo's DOM is
            unchanged from before there were crops at all. */}
        {crop ? (
          <div className="absolute" style={cropBoxStyle(crop)}>
            {image}
          </div>
        ) : (
          image
        )}
      </div>

      <div className="grid max-w-sm gap-1.5">
        <CropSlider
          label="Zoom"
          min={100}
          max={MAX_ZOOM * 100}
          step={ZOOM_PERCENT_STEP}
          value={zoomPercent}
          valueText={`${zoomPercent / 100}×`}
          onChange={(value) => move(value / 100, centreX, centreY)}
        />
        <CropSlider
          label="Horizontal position"
          min={0}
          max={100}
          step={1}
          value={position(rect.x, slackX)}
          valueText={`${position(rect.x, slackX)}%`}
          disabled={!movableX}
          onChange={(value) =>
            move(zoom, centreAt(value, rect.w, slackX), centreY)
          }
        />
        <CropSlider
          label="Vertical position"
          min={0}
          max={100}
          step={1}
          value={position(rect.y, slackY)}
          valueText={`${position(rect.y, slackY)}%`}
          disabled={!movableY}
          onChange={(value) =>
            move(zoom, centreX, centreAt(value, rect.h, slackY))
          }
        />
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!crop}
            onClick={() => onChange(bare)}
          >
            Reset crop
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One axis of the crop, as the plain range input it is.
 *
 * `aria-valuetext` carries the unit, because "1.4" and "62" say nothing on
 * their own and the visible number beside the track is `aria-hidden` for the
 * same reason -- a screen reader should hear it once, from the slider.
 */
function CropSlider({
  label,
  min,
  max,
  step,
  value,
  valueText,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="app-muted w-32 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
        // 24px tall, which is WCAG 2.2's minimum target and a good deal more
        // than a native range gives you: the default control is ~16px, which
        // the a11y scan fails on 2.5.8 and a thumb is fiddly to hit.
        className="h-6 min-w-0 flex-1 accent-[var(--purple-deep)] disabled:opacity-50"
      />
      <span aria-hidden className="app-muted w-10 shrink-0 tabular-nums">
        {disabled ? "—" : valueText}
      </span>
    </label>
  );
}
