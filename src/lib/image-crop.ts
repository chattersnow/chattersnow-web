import type { CSSProperties } from "react";

/**
 * A presentational crop, carried on the image URL itself.
 *
 * Every admin-set photo on the public site is a pasted link -- a Google Drive
 * share link, mostly -- so we do not own the bytes and cannot crop the file.
 * The crop is therefore stored beside the link as a `#crop=x,y,w,h` fragment
 * and applied with CSS:
 *
 *     https://drive.google.com/file/d/1abc.../view#crop=0.1800,0.2600,0.6400,0.4288
 *
 * Keeping it inside the one string is what makes it free: a team photo lives in
 * three unrelated stores (`site_content` image slots, `about_team.members[]
 * .photo_url`, `public_team_members.photo_url`), all holding a bare URL, and a
 * fragment needs no migration, no view change and no change to the ~20 public
 * pages that render a `SiteImage`. It also means a crop edit *is* a slot change
 * in the Website editor, so it marks dirty, publishes atomically with the photo
 * and lands in the audit trail with no work. A consumer that drops the stored
 * value into an `<img src>` -- the public content API's, say -- ignores the
 * fragment and gets the whole picture.
 *
 * **A stored rect is only exact at the frame aspect it was authored at.** The
 * rect is normalised against the natural image, not against any frame, so when
 * a page renders the photo at a different aspect than the crop was drawn for,
 * the rect is itself centre-cropped to the frame (that is what
 * `cropObjectPosition` buys). This is not hypothetical: `get_involved_hero_1`
 * is a 4/3 slot rendered `aspect-[2/1]` below the `sm` breakpoint, so every
 * phone on `/get-involved` takes that path. It is the best a single stored
 * rectangle can do, and it is not a bug.
 */
export type ImageCrop = { x: number; y: number; w: number; h: number };

/** The most a crop may magnify the image past plain `object-cover`. */
export const MAX_ZOOM = 4;

const CROP_PREFIX = "#crop=";

/** Four decimals: enough to be invisible, few enough that float noise cannot trip the editor's dirty check. */
const PRECISION = 4;

/** Absorbs the float slop in comparisons like `x + w <= 1`. */
const EPSILON = 1e-9;

const NUMBER = /^-?\d*\.?\d+$/;

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isIdentity(crop: ImageCrop): boolean {
  return (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.w >= 1 - EPSILON &&
    crop.h >= 1 - EPSILON
  );
}

function isValidCrop(crop: ImageCrop): boolean {
  const { x, y, w, h } = crop;
  if (![x, y, w, h].every((value) => Number.isFinite(value))) return false;
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return false;
  return x + w <= 1 + EPSILON && y + h <= 1 + EPSILON;
}

/**
 * Splits a stored image URL into the src to render and the crop to apply.
 *
 * Only a fragment that starts `#crop=` *and* parses to four sane numbers is
 * consumed. Anything else is left on the URL untouched with `crop: null`, so
 * `#gid=1` survives and a hand-typed `#crop=garbage` stays visible rather than
 * being silently eaten -- a value edited by hand must never be able to take a
 * public page down. The identity rect is reported as no crop at all, so a photo
 * that has been cropped and reset renders exactly as one that never was.
 */
export function parseImageCrop(url: string | null): {
  src: string | null;
  crop: ImageCrop | null;
} {
  if (!url) return { src: url ?? null, crop: null };

  const hash = url.indexOf("#");
  if (hash <= 0) return { src: url, crop: null };

  const fragment = url.slice(hash);
  if (!fragment.startsWith(CROP_PREFIX)) return { src: url, crop: null };

  const parts = fragment.slice(CROP_PREFIX.length).split(",");
  if (parts.length !== 4) return { src: url, crop: null };
  if (!parts.every((part) => NUMBER.test(part.trim()))) {
    return { src: url, crop: null };
  }

  const [x, y, w, h] = parts.map((part) => Number(part.trim()));
  const crop = { x, y, w, h };
  if (!isValidCrop(crop)) return { src: url, crop: null };

  const src = url.slice(0, hash);
  return { src, crop: isIdentity(crop) ? null : crop };
}

/**
 * Writes a crop onto a src, or strips one off.
 *
 * Setting a crop replaces whatever fragment was there, since the encoding gives
 * the crop the fragment slot and the two cannot coexist. Clearing one is the
 * careful direction and removes only a `#crop=` fragment, so a reset cannot eat
 * something it does not own. The identity rect serialises to no fragment at
 * all, which is what makes "never cropped" and "reset" the identical string.
 */
export function withImageCrop(src: string, crop: ImageCrop | null): string {
  const hash = src.indexOf("#");

  if (!crop || !isValidCrop(crop) || isIdentity(crop)) {
    return parseImageCrop(src).src ?? src;
  }

  const bare = hash > 0 ? src.slice(0, hash) : src;
  const parts = [crop.x, crop.y, crop.w, crop.h].map((value) =>
    value.toFixed(PRECISION),
  );
  return `${bare}${CROP_PREFIX}${parts.join(",")}`;
}

function percent(value: number): string {
  return `${round(value * 100, PRECISION)}%`;
}

/**
 * Positions and scales the box the image fills so that the crop rect lands on
 * the frame: the box is `1/w` by `1/h` of the frame, shifted back by the rect's
 * own offset.
 */
export function cropBoxStyle(crop: ImageCrop): CSSProperties {
  return {
    left: percent(-crop.x / crop.w),
    top: percent(-crop.y / crop.h),
    width: percent(1 / crop.w),
    height: percent(1 / crop.h),
  };
}

/**
 * The rect's centre, as an `object-position`.
 *
 * Load-bearing rather than decorative: the inner box has aspect `Φ·(h/w)`,
 * which equals the image's natural aspect only at the frame aspect the crop was
 * authored for. Anywhere else `object-cover` would centre the *image* in the
 * box instead of the rect, drifting a rect near an edge by a meaningful
 * fraction of the frame. Pinning the rect's centre to the frame's centre turns
 * that degraded case into "the rect, centre-cropped to the frame".
 */
export function cropObjectPosition(crop: ImageCrop): string {
  const cx = round((crop.x + crop.w / 2) * 100, 2);
  const cy = round((crop.y + crop.h / 2) * 100, 2);
  return `${cx}% ${cy}%`;
}

const SIZE_TOKEN = /^(\d*\.?\d+)(vw|px|rem|em)$/;

/**
 * Widens every length in a `sizes` attribute by `factor`, because a cropped
 * image is laid out `1/w` wider than the frame it is seen through and would
 * otherwise be fetched at the frame's resolution and upscaled.
 *
 * Done as arithmetic on plain `<number><unit>` tokens rather than with
 * `calc()`, which `sizes` does not accept. An entry whose trailing token is
 * anything else passes through untouched.
 */
export function scaleSizes(sizes: string, factor: number): string {
  if (!Number.isFinite(factor)) return sizes;
  const scale = clamp(factor, 1, 8);
  if (scale === 1) return sizes;

  return sizes
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      const split = trimmed.lastIndexOf(" ");
      const match = SIZE_TOKEN.exec(trimmed.slice(split + 1));
      if (!match) return trimmed;
      const scaled = round(Number(match[1]) * scale, 2);
      return `${trimmed.slice(0, split + 1)}${scaled}${match[2]}`;
    })
    .join(", ");
}

/** The widest rect of the target aspect that fits the image, as a fraction of its width. */
function baseWidth(imageAspect: number, targetAspect: number): number {
  const image =
    imageAspect > 0 && Number.isFinite(imageAspect) ? imageAspect : 1;
  const target =
    targetAspect > 0 && Number.isFinite(targetAspect) ? targetAspect : 1;
  return image >= target ? target / image : 1;
}

/**
 * The crop rect for a zoom and a centre point, locked to the target aspect and
 * clamped inside the image.
 *
 * Zoom is parameterised `z >= 1`, where `z = 1` is the largest rect of the
 * target aspect that fits -- byte-identical to today's plain `object-cover`.
 * The rect therefore carries the aspect it was authored at implicitly, which is
 * what `cropZoom` reads back off it.
 */
export function fitCrop(
  imageAspect: number,
  targetAspect: number,
  zoom: number,
  cx: number,
  cy: number,
): ImageCrop {
  const zoomed = clamp(zoom, 1, MAX_ZOOM);
  const w1 = baseWidth(imageAspect, targetAspect);
  const h1 = w1 === 1 ? baseWidth(targetAspect, imageAspect) : 1;

  const w = round(w1 / zoomed, PRECISION);
  const h = round(h1 / zoomed, PRECISION);
  const x = Math.min(round(clamp(cx - w / 2, 0, 1 - w), PRECISION), 1 - w);
  const y = Math.min(round(clamp(cy - h / 2, 0, 1 - h), PRECISION), 1 - h);

  return { x: Math.max(x, 0), y: Math.max(y, 0), w, h };
}

/** Reads the zoom back off a stored rect, inverting `fitCrop` at the same aspects. */
export function cropZoom(
  crop: ImageCrop,
  imageAspect: number,
  targetAspect: number,
): number {
  const w1 = baseWidth(imageAspect, targetAspect);
  const h1 = w1 === 1 ? baseWidth(targetAspect, imageAspect) : 1;
  return w1 === 1 ? h1 / crop.h : w1 / crop.w;
}

/**
 * Asks Drive for a larger thumbnail when a crop will magnify it.
 *
 * `resolveImageUrl()` requests `sz=w1000`, which is sized for a photo shown
 * whole; a crop lays the image out `1/w` wider than the frame, so the same
 * bytes get upscaled. Only cropped photos are boosted, so uncropped ones keep
 * their existing cache entries. `remotePatterns` constrains `pathname:
 * "/thumbnail"` only, so changing the query is safe.
 */
export function boostThumbnail(src: string, crop: ImageCrop | null): string {
  if (!crop || crop.w >= 1) return src;
  return src.replace("sz=w1000", "sz=w1600");
}
