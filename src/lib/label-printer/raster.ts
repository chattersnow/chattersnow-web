import {
  DOTS_PER_MM,
  bitmapBytesPerRow,
  bitmapGet,
  type Bitmap,
} from "./bitmap";

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

/**
 * The die-cut stock as it sits in the printer: 50 mm across the printhead,
 * 30 mm along the feed, which is how the stock's own tag reports it.
 */
export const KATASYMBOL_LABEL_MM = { width: 50, height: 30 } as const;

/** The stock in dots, across the head by along the feed. */
export const RASTER_SIZE = {
  width: KATASYMBOL_LABEL_MM.width * DOTS_PER_MM,
  height: KATASYMBOL_LABEL_MM.height * DOTS_PER_MM,
} as const;

/**
 * The label as it is read. Stuck on an item it stands taller than it is
 * wide, so it is drawn 30 mm across and 50 mm down, and turned a quarter to
 * go through the printer the way the stock is loaded.
 */
export const UPRIGHT_SIZE = {
  width: RASTER_SIZE.height,
  height: RASTER_SIZE.width,
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

/**
 * The bitmap turned a quarter clockwise: the upright label as the printer
 * takes it off 50 × 30 stock, the top of the label on the right.
 */
export function rotateClockwise(bitmap: Bitmap): Bitmap {
  const width = bitmap.height;
  const height = bitmap.width;
  const stride = bitmapBytesPerRow(width);
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (!bitmapGet(bitmap, x, y)) continue;
      const toX = width - 1 - y;
      data[x * stride + (toX >> 3)] |= 0x80 >> (toX & 7);
    }
  }
  return { width, height, data };
}

/** A canvas of exactly a bitmap's dots, black on white. */
export function bitmapToCanvas(bitmap: Bitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(bitmap.width, bitmap.height);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      const i = (y * bitmap.width + x) * 4;
      const value = bitmapGet(bitmap, x, y) ? 0 : 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

// Layout of the upright label, in printer dots (8 per mm). Its height runs
// across the 48 mm printhead, so a millimetre comes off the top and bottom of
// the 50 mm label, and a die cut wanders about as much again: nothing is
// drawn within 2.5 mm of those ends or 2 mm of the sides. The QR is 24 mm
// with its quiet zone, over half a millimetre a module, which a phone reads
// easily, and leaves the lower two fifths for the text. The organization's
// logo, when it has one, takes a 5 mm band above the QR, and the rest moves
// down to make room for it.
const PAD_X = 16;
const PAD_Y = 20;
const CONTENT_WIDTH = UPRIGHT_SIZE.width - PAD_X * 2;
const LOGO_HEIGHT = 40;
const QR_SIZE = 192;
const QR_LEFT = (UPRIGHT_SIZE.width - QR_SIZE) / 2;
const GAP = 6;
const TEXT_BOTTOM = UPRIGHT_SIZE.height - PAD_Y;
const CENTER_X = UPRIGHT_SIZE.width / 2;
const LINE_GAP = 3;

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

/**
 * The largest box of the image's own proportions that fits `maxWidth` by
 * `maxHeight`.
 */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

/**
 * Draws one label upright and returns the black and white dots the printer
 * burns, as they read on the label. `logo` is the organization's, already
 * loaded, since every label in a run carries the same one; it must be
 * same-origin, or the canvas can't be read back.
 */
export async function renderLabel(
  label: RasterLabel,
  logo: HTMLImageElement | null = null,
): Promise<Bitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = UPRIGHT_SIZE.width;
  canvas.height = UPRIGHT_SIZE.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await document.fonts.ready;
  let qrTop = PAD_Y;
  if (logo) {
    const box = fitWithin(
      logo.naturalWidth,
      logo.naturalHeight,
      CONTENT_WIDTH,
      LOGO_HEIGHT,
    );
    ctx.drawImage(
      logo,
      (UPRIGHT_SIZE.width - box.width) / 2,
      PAD_Y + (LOGO_HEIGHT - box.height) / 2,
      box.width,
      box.height,
    );
    qrTop += LOGO_HEIGHT + GAP;
  }
  const qr = await loadImage(label.qrSrc);
  ctx.drawImage(qr, QR_LEFT, qrTop, QR_SIZE, QR_SIZE);
  const textTop = qrTop + QR_SIZE + GAP;

  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  const measureAt = (font: string) => (text: string, size: number) => {
    ctx.font = font.replace("{size}", String(size));
    return ctx.measureText(text).width;
  };
  const codeFont = `700 {size}px ${MONO}`;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  const codeOnly = !label.description && !label.size;
  if (codeOnly) {
    // A numbered code or a blank printed ahead of intake: the code is the
    // whole label.
    const size = fitFontSize(
      label.code,
      CONTENT_WIDTH,
      72,
      16,
      measureAt(codeFont),
    );
    ctx.font = codeFont.replace("{size}", String(size));
    ctx.fillText(
      label.code,
      CENTER_X,
      (textTop + TEXT_BOTTOM) / 2 + size * 0.35,
    );
  } else {
    // The code sits on the bottom edge; the name and size fill down to it.
    const codeSize = fitFontSize(
      label.code,
      CONTENT_WIDTH,
      44,
      18,
      measureAt(codeFont),
    );
    const codeTop = TEXT_BOTTOM - codeSize * 0.75;
    const measure = (text: string) => ctx.measureText(text).width;
    const descriptionSize = 20;
    const sizeSize = 18;
    const room = codeTop - GAP - textTop;
    let y = textTop;
    if (label.description) {
      const sizeRoom = label.size ? sizeSize + LINE_GAP : 0;
      const maxLines = Math.max(
        1,
        Math.floor((room - sizeRoom) / (descriptionSize + LINE_GAP)),
      );
      ctx.font = `600 ${descriptionSize}px ${sans}`;
      for (const line of wrapText(
        label.description,
        CONTENT_WIDTH,
        measure,
        maxLines,
      )) {
        y += descriptionSize;
        ctx.fillText(line, CENTER_X, y);
        y += LINE_GAP;
      }
    }
    if (label.size) {
      const sizeText = `Size ${label.size}`;
      const sizeFont = `400 {size}px ${sans}`;
      const size = fitFontSize(
        sizeText,
        CONTENT_WIDTH,
        sizeSize,
        14,
        measureAt(sizeFont),
      );
      ctx.font = sizeFont.replace("{size}", String(size));
      const [line] = wrapText(sizeText, CONTENT_WIDTH, measure, 1);
      ctx.fillText(line, CENTER_X, y + size);
    }
    ctx.font = codeFont.replace("{size}", String(codeSize));
    ctx.fillText(label.code, CENTER_X, TEXT_BOTTOM);
  }

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return thresholdPixels(pixels.data, canvas.width, canvas.height);
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG failed"))),
      "image/png",
    ),
  );
}
