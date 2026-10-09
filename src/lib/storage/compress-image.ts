/**
 * Shrinking a picked image to something worth storing, shared by every surface
 * that uploads one.
 *
 * Its own module rather than a corner of `gear-photos`, where it started and
 * where two unrelated features -- artwork submissions (#870) and site photos
 * (#921) -- were importing it from. Nothing about resizing an image belongs to
 * one bucket, and the indirection showed: a test that mocks
 * `@/lib/storage/gear-photos` replaces this function for every caller of it,
 * which is only invisible because `bun test` runs with `--isolate`.
 *
 * `MAX_EDGE` and `JPEG_QUALITY` are gear intake's numbers, kept as the default
 * because that is the surface they were chosen for; a caller that wants
 * another size passes one (`SITE_PHOTO_MAX_EDGE`).
 */

/** Longest edge of a stored photo, in pixels. */
export const MAX_EDGE = 1600;

/** JPEG quality for the re-encode. 1600px at 0.8 lands around 250 KB. */
export const JPEG_QUALITY = 0.8;

/**
 * The pure half of `compressImage`, split out so the sizing rules can be tested
 * without a canvas.
 *
 * Scales the longest edge down to `maxEdge` and never up -- a photo already
 * smaller than the cap is re-encoded at its own size rather than blown up into
 * a bigger file with no more detail. Every result is at least 1px on each side,
 * because a canvas of zero width throws.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest <= maxEdge ? 1 : maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Re-encodes a picked image to a JPEG no larger than `MAX_EDGE` on its longest
 * edge -- or to WebP or PNG when `type` says so, which keeps transparency: a
 * JPEG has no alpha channel, so a logo's transparent background would come out
 * black or white (#1488).
 *
 * `imageOrientation: "from-image"` is not optional. Phone photos carry their
 * rotation in EXIF rather than in the pixels, and `drawImage` of a raw bitmap
 * ignores it -- without this a large share of intake photos would be stored
 * sideways permanently, with no way for the volunteer to tell at capture time.
 * The dimensions are read off the bitmap afterwards for the same reason: a
 * rotated photo's width and height are swapped relative to the file.
 *
 * Decoding through the browser also normalizes iPhone HEIC into JPEG for free,
 * which is why there is no `heic2any` dependency here.
 *
 * Throws if the image cannot be decoded. That failure is deliberately not
 * caught into "upload the original instead": the bucket's allowed_mime_types
 * would refuse a HEIC with a far worse message, and a 12 MP original would blow
 * the 5 MiB cap.
 *
 * `maxEdge` is a parameter because not every surface wants a gear photo's
 * 1600px. A site photo is a 21:9 band across a desktop hero rather than a
 * thumbnail in a list, and asks for more (#921).
 */
export async function compressImage(
  file: File,
  maxEdge: number = MAX_EDGE,
  type: "image/jpeg" | "image/webp" | "image/png" = "image/jpeg",
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const { width, height } = targetDimensions(
      bitmap.width,
      bitmap.height,
      maxEdge,
    );
    // Safari's canvas cannot make WebP and hands back a PNG instead. For a
    // logo that is the right fallback -- both keep the alpha channel -- so the
    // caller reads the type off the blob rather than assuming it.
    return await encode(bitmap, width, height, type, JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

/**
 * Whether this browser's canvas can encode WebP: true in Chrome, Edge and
 * Firefox, false in Safari, which quietly returns a PNG instead.
 *
 * Asked before an upload rather than read off the encoded blob, because the
 * object's name (and so its extension) is decided before the image is
 * encoded -- see `createSitePhotoPathAction`.
 */
export function canEncodeWebp(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

export type EncodedImage = { blob: Blob; width: number; height: number };

/**
 * Encodes one picked image at several widths, decoding it once (#1472).
 *
 * `compressImage` sizes by the longest edge because a photo may be either way
 * round; this sizes by *width*, because what it makes is a `srcset`, whose `w`
 * descriptors are widths. Never enlarges: a width wider than the image is
 * encoded at the image's own width. The widths are chosen from the decoded
 * width, which is the only one that counts once EXIF rotation is applied --
 * `renditionWidths()` in `src/lib/publications.ts` is what the editor passes.
 *
 * Asks for WebP and checks what came back. Safari's canvas cannot encode WebP
 * and quietly returns a PNG instead -- several times the size of the JPEG it
 * could have made -- so anything other than the type asked for is re-encoded
 * as JPEG, which every browser can make and the bucket accepts.
 */
export async function encodeImageWidths(
  file: File,
  widthsFor: (sourceWidth: number) => readonly number[],
  type: "image/webp" | "image/jpeg" = "image/webp",
  quality: number = JPEG_QUALITY,
): Promise<EncodedImage[]> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const results: EncodedImage[] = [];
    for (const target of widthsFor(bitmap.width)) {
      const width = Math.max(1, Math.min(bitmap.width, Math.round(target)));
      const height = Math.max(
        1,
        Math.round((bitmap.height * width) / bitmap.width),
      );
      let blob = await encode(bitmap, width, height, type, quality);
      if (blob.type !== type) {
        blob = await encode(bitmap, width, height, "image/jpeg", quality);
      }
      results.push({ blob, width, height });
    }
    return results;
  } finally {
    bitmap.close();
  }
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2d canvas context");
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2d canvas context");
  context.drawImage(bitmap, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas produced no blob")),
      type,
      quality,
    );
  });
}
