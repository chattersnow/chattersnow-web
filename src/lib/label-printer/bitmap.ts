/**
 * A label's 1-bit raster rearranged for the printhead (#1447).
 *
 * Ported from supvan-cups (`supvan-proto/src/bitmap.rs`, MIT, © 2026 Florian
 * Hänel; see THIRD_PARTY_LICENSE).
 *
 * The T50 family burns one line across the tape at a time, so the printer
 * wants the image line by line along the feed: each "column" is one row of
 * the image as it lies across the head, packed least-significant bit first.
 * The head is 384 dots (48 mm at 8 dots/mm) and the tape runs centred under
 * it, so a line is centred in a head-width canvas, and a 50 mm label loses a
 * millimetre off each side.
 */

export const DOTS_PER_MM = 8;
export const PRINTHEAD_DOTS = 384;

/** A 1-bit image, row-major, most significant bit first; 1 is ink. */
export type Bitmap = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function bitmapBytesPerRow(width: number): number {
  return Math.ceil(width / 8);
}

export function bitmapGet(bitmap: Bitmap, x: number, y: number): boolean {
  const byte =
    bitmap.data[y * bitmapBytesPerRow(bitmap.width) + Math.floor(x / 8)];
  return ((byte >> (7 - (x % 8))) & 1) === 1;
}

/**
 * One printhead line per image row: `height` lines of `PRINTHEAD_DOTS / 8`
 * bytes, each row centred on the head (cropped evenly when wider).
 */
export function toPrintheadLines(bitmap: Bitmap): {
  data: Uint8Array;
  lines: number;
  bytesPerLine: number;
} {
  const bytesPerLine = PRINTHEAD_DOTS / 8;
  const data = new Uint8Array(bitmap.height * bytesPerLine);
  // Positive: blank dots before the image. Negative: image dots cropped.
  const offset = Math.floor((PRINTHEAD_DOTS - bitmap.width) / 2);
  for (let y = 0; y < bitmap.height; y++) {
    for (let dot = 0; dot < PRINTHEAD_DOTS; dot++) {
      const x = dot - offset;
      if (x < 0 || x >= bitmap.width || !bitmapGet(bitmap, x, y)) continue;
      data[y * bytesPerLine + (dot >> 3)] |= 1 << (dot & 7);
    }
  }
  return { data, lines: bitmap.height, bytesPerLine };
}
