import { DOTS_PER_MM, bitmapBytesPerRow, type Bitmap } from "./bitmap";

/**
 * A label drawn dot for dot at the printer's resolution (#1447), for the two
 * ways onto a Katasymbol T50M Pro: sent straight to it, or saved as a PNG for
 * the Katasymbol app. Both use this one drawing, so the preview, the file and
 * the printed label are the same picture.
 *
 * Drawn directly on a canvas rather than captured from the page, so the
 * output doesn't depend on the page's layout or a screenshot library. Then
 * cut to pure black and white: the printer has no grey, and a QR code and
 * small type need hard edges, not a dither.
 */

/** The die-cut stock: 50 mm across the printhead, 30 mm along the feed. */
export const KATASYMBOL_LABEL_MM = { width: 50, height: 30 } as const;

export const RASTER_SIZE = {
  width: KATASYMBOL_LABEL_MM.width * DOTS_PER_MM,
  height: KATASYMBOL_LABEL_MM.height * DOTS_PER_MM,
} as const;

/** Darker than this (0-255 luma) prints. */
export const INK_THRESHOLD = 180;

export type RasterLabel = {
  code: string;
  description: string;
  size: string | null;
  qrSrc: string;
};

/** Canvas pixels to a 1-bit bitmap: luma under the threshold is ink. */
export function thresholdPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = INK_THRESHOLD,
): Bitmap {
  const stride = bitmapBytesPerRow(width);
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Transparent counts as the white label underneath.
      const alpha = rgba[i + 3] / 255;
      const luma =
        (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha +
        255 * (1 - alpha);
      if (luma < threshold) data[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}

/**
 * Words into at most `maxLines` lines no wider than `maxWidth`, breaking a
 * word only when it is wider than a line on its own, and ending the last line
 * with an ellipsis when the text doesn't fit.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = (next: string) => {
    lines.push(next);
    line = "";
  };
  for (let w = 0; w < words.length; w++) {
    let word = words[w];
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) push(line);
    // A word wider than the line is split where it overflows.
    while (measure(word) > maxWidth) {
      let cut = word.length - 1;
      while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut--;
      push(word.slice(0, cut));
      word = word.slice(cut);
    }
    line = word;
  }
  if (line) push(line);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** The largest size, at most `max`, at which `text` fits `maxWidth`. */
export function fitFontSize(
  text: string,
  maxWidth: number,
  max: number,
  min: number,
  measureAt: (text: string, size: number) => number,
): number {
  let size = max;
  while (size > min && measureAt(text, size) > maxWidth) size--;
  return size;
}

// Layout, in printer dots (8 per mm). The printhead is 48 mm, so a millimetre
// comes off each side of the 50 mm label, and a die cut wanders about as much
// again: nothing is drawn within 2.5 mm of the side edges or 2 mm of the ends.
// The QR is 21 mm with its quiet zone, about half a millimetre a module, which
// a phone reads easily and leaves the text half the label.
const PAD_X = 20;
const PAD_Y = 16;
const QR_SIZE = 168;
const QR_TOP = (RASTER_SIZE.height - QR_SIZE) / 2;
const GAP = 4;
const TEXT_LEFT = PAD_X + QR_SIZE + GAP;
const TEXT_WIDTH = RASTER_SIZE.width - PAD_X - TEXT_LEFT;

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

/**
 * Draws one label and returns it both as the bitmap the printer takes and as
 * a canvas of exactly those black and white dots.
 */
export async function renderLabel(
  label: RasterLabel,
): Promise<{ bitmap: Bitmap; canvas: HTMLCanvasElement }> {
  const canvas = document.createElement("canvas");
  canvas.width = RASTER_SIZE.width;
  canvas.height = RASTER_SIZE.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await document.fonts.ready;
  const qr = await loadImage(label.qrSrc);
  ctx.drawImage(qr, PAD_X, QR_TOP, QR_SIZE, QR_SIZE);

  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  const measureAt = (font: string) => (text: string, size: number) => {
    ctx.font = font.replace("{size}", String(size));
    return ctx.measureText(text).width;
  };
  const codeFont = `700 {size}px ${MONO}`;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";

  const codeOnly = !label.description && !label.size;
  if (codeOnly) {
    // A numbered code or a blank printed ahead of intake: the code is the
    // whole label.
    const size = fitFontSize(
      label.code,
      TEXT_WIDTH,
      72,
      16,
      measureAt(codeFont),
    );
    ctx.font = codeFont.replace("{size}", String(size));
    ctx.fillText(label.code, TEXT_LEFT, RASTER_SIZE.height / 2 + size * 0.35);
  } else {
    const measure = (text: string) => ctx.measureText(text).width;
    let y = PAD_Y;
    if (label.description) {
      const size = 20;
      ctx.font = `600 ${size}px ${sans}`;
      const lines = wrapText(
        label.description,
        TEXT_WIDTH,
        measure,
        label.size ? 4 : 5,
      );
      for (const line of lines) {
        y += size;
        ctx.fillText(line, TEXT_LEFT, y);
        y += 3;
      }
    }
    if (label.size) {
      const sizeText = `Size ${label.size}`;
      const sizeFont = `400 {size}px ${sans}`;
      const size = fitFontSize(
        sizeText,
        TEXT_WIDTH,
        18,
        14,
        measureAt(sizeFont),
      );
      ctx.font = sizeFont.replace("{size}", String(size));
      const [line] = wrapText(sizeText, TEXT_WIDTH, measure, 1);
      ctx.fillText(line, TEXT_LEFT, y + size + 3);
    }
    const size = fitFontSize(
      label.code,
      TEXT_WIDTH,
      44,
      18,
      measureAt(codeFont),
    );
    ctx.font = codeFont.replace("{size}", String(size));
    ctx.fillText(label.code, TEXT_LEFT, RASTER_SIZE.height - PAD_Y);
  }

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bitmap = thresholdPixels(pixels.data, canvas.width, canvas.height);
  // Paint the cut back, so the saved image is what the printer would burn.
  for (let i = 0; i < pixels.data.length; i += 4) {
    const x = (i / 4) % canvas.width;
    const y = Math.floor(i / 4 / canvas.width);
    const ink =
      (bitmap.data[y * bitmapBytesPerRow(canvas.width) + (x >> 3)] &
        (0x80 >> (x & 7))) !==
      0;
    const value = ink ? 0 : 255;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return { bitmap, canvas };
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG failed"))),
      "image/png",
    ),
  );
}
