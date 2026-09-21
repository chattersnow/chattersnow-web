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
 * edge.
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

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2d canvas context");
      context.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({
        type: "image/jpeg",
        quality: JPEG_QUALITY,
      });
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
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
