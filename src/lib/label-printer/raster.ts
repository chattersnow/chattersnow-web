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
 * A roll of die-cut labels in millimetres, as the stock and the Katasymbol
 * app give it: across the printhead, then along the feed. A label is drawn
 * the way it runs through the printer, so the picture is never turned.
 */
export type LabelStock = { widthMm: number; heightMm: number };

/** The stock in dots: across the head by along the feed. */
export function stockDots(stock: LabelStock): {
  width: number;
  height: number;
} {
  return {
    width: stock.widthMm * DOTS_PER_MM,
    height: stock.heightMm * DOTS_PER_MM,
  };
}

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

/**
 * The two ways a label is laid out, in printer dots (8 per mm). Stock taller
 * than it is wide stacks the logo, the QR and the text; wide stock puts the
 * QR on the left and the rest beside it. Either way the content is centred
 * as one group, so a short label isn't all at the top.
 *
 * The head is 48 mm, so a 50 mm label loses a millimetre off each side, and
 * a die cut wanders about as much again: `padX` and `padY` keep the print
 * clear of both. The QR carries its own four-module quiet zone, so nothing
 * needs more room around it.
 */
type Shape = {
  padX: number;
  padY: number;
  gap: number;
  logoHeight: number;
  qrMax: number;
  descriptionSize: number;
  maxDescriptionLines: number;
  sizeSize: number;
  codeMax: number;
  /** The code on a label that carries nothing else, where it can be big. */
  codeOnlyMax: number;
  codeMin: number;
};

/** 50 × 80 mm: a QR about 36 mm across, under a 12 mm logo band. */
const UPRIGHT: Shape = {
  padX: 24,
  padY: 20,
  gap: 10,
  logoHeight: 96,
  qrMax: 296,
  descriptionSize: 28,
  maxDescriptionLines: 3,
  sizeSize: 24,
  codeMax: 64,
  codeOnlyMax: 88,
  codeMin: 24,
};

/** 40 × 30 mm: a QR about 20 mm across, the text in the 16 mm beside it. */
const WIDE: Shape = {
  padX: 16,
  padY: 16,
  gap: 6,
  logoHeight: 32,
  qrMax: 176,
  descriptionSize: 18,
  maxDescriptionLines: 4,
  sizeSize: 16,
  codeMax: 40,
  codeOnlyMax: 48,
  codeMin: 14,
};

const LINE_GAP = 3;

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * bwip-js draws a QR module 4 units square at its default scale; see
 * `qrCodeDataUri`, whose padding counts in the same units.
 */
const QR_UNITS_PER_MODULE = 4;

/**
 * The QR's width in modules, quiet zone included, read from the viewBox of
 * the SVG it comes as; null when that can't be read.
 */
export function qrModules(qrSrc: string): number | null {
  const comma = qrSrc.indexOf(",");
  if (!qrSrc.startsWith("data:image/svg+xml") || comma < 0) return null;
  let svg: string;
  try {
    svg = decodeURIComponent(qrSrc.slice(comma + 1));
  } catch {
    return null;
  }
  const match = /viewBox="0 0 (\d+) \d+"/.exec(svg);
  if (!match) return null;
  const units = Number(match[1]);
  return units % QR_UNITS_PER_MODULE === 0 ? units / QR_UNITS_PER_MODULE : null;
}

/**
 * The largest size, at most `maxDots`, at which every module is the same
 * whole number of dots. Stretched to any other size, some modules land a dot
 * wider than their neighbours and the cut to black and white rounds their
 * blurred edges unevenly, which a phone reads less readily.
 */
export function qrDrawSize(modules: number | null, maxDots: number): number {
  if (!modules || modules > maxDots) return maxDots;
  return Math.floor(maxDots / modules) * modules;
}

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

/** Something drawn at a given top, `height` dots tall. */
type Block = { height: number; draw: (top: number) => void };

/** The blocks one under another, `gap` apart, centred between top and bottom. */
function drawStack(blocks: Block[], top: number, bottom: number, gap: number) {
  const total =
    blocks.reduce((sum, block) => sum + block.height, 0) +
    gap * Math.max(0, blocks.length - 1);
  let y = Math.round(top + Math.max(0, (bottom - top - total) / 2));
  for (const block of blocks) {
    block.draw(y);
    y += block.height + gap;
  }
}

/**
 * Draws one label on `stock` and returns the black and white dots the
 * printer burns, as they lie on the label coming out of it. `logo` is the
 * organization's, already loaded, since every label in a run carries the same
 * one; it must be same-origin, or the canvas can't be read back.
 */
export async function renderLabel(
  label: RasterLabel,
  stock: LabelStock,
  logo: HTMLImageElement | null = null,
): Promise<Bitmap> {
  const { width, height } = stockDots(stock);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";

  await document.fonts.ready;
  const qr = await loadImage(label.qrSrc);
  const wide = width > height;
  const shape = wide ? WIDE : UPRIGHT;
  const qrSize = qrDrawSize(qrModules(label.qrSrc), shape.qrMax);

  // The column the logo and text share: the label's width when stacked, the
  // space right of the QR when wide.
  let columnLeft = shape.padX;
  if (wide) {
    // Half the usual margin: the quiet zone is blank, and keeps the modules
    // themselves well inside the die cut.
    const qrLeft = shape.padX / 2;
    ctx.drawImage(
      qr,
      qrLeft,
      Math.round((height - qrSize) / 2),
      qrSize,
      qrSize,
    );
    columnLeft = qrLeft + qrSize;
  }
  const columnWidth = width - shape.padX - columnLeft;
  const center = columnLeft + columnWidth / 2;

  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  const measureAt = (font: string) => (text: string, size: number) => {
    ctx.font = font.replace("{size}", String(size));
    return ctx.measureText(text).width;
  };
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  const blocks: Block[] = [];
  if (logo) {
    const box = fitWithin(
      logo.naturalWidth,
      logo.naturalHeight,
      columnWidth,
      shape.logoHeight,
    );
    blocks.push({
      height: Math.round(box.height),
      draw: (top) =>
        ctx.drawImage(logo, center - box.width / 2, top, box.width, box.height),
    });
  }
  if (!wide) {
    blocks.push({
      height: qrSize,
      draw: (top) =>
        ctx.drawImage(
          qr,
          Math.round((width - qrSize) / 2),
          top,
          qrSize,
          qrSize,
        ),
    });
  }

  // A numbered code or a blank printed ahead of intake carries the code
  // alone, so it can be as big as the column allows.
  const codeOnly = !label.description && !label.size;
  const codeFont = `700 {size}px ${MONO}`;
  const codeSize = fitFontSize(
    label.code,
    columnWidth,
    codeOnly ? shape.codeOnlyMax : shape.codeMax,
    shape.codeMin,
    measureAt(codeFont),
  );
  // Capitals and digits: no descender to leave room for.
  const codeHeight = Math.round(codeSize * 0.72);
  const code: Block = {
    height: codeHeight,
    draw: (top) => {
      ctx.font = codeFont.replace("{size}", String(codeSize));
      ctx.fillText(label.code, center, top + codeHeight);
    },
  };

  let sizeBlock: Block | null = null;
  if (label.size) {
    const sizeFont = `400 {size}px ${sans}`;
    const size = fitFontSize(
      `Size ${label.size}`,
      columnWidth,
      shape.sizeSize,
      Math.min(14, shape.sizeSize),
      measureAt(sizeFont),
    );
    ctx.font = sizeFont.replace("{size}", String(size));
    const [line] = wrapText(
      `Size ${label.size}`,
      columnWidth,
      (text) => ctx.measureText(text).width,
      1,
    );
    sizeBlock = {
      height: size,
      draw: (top) => {
        ctx.font = sizeFont.replace("{size}", String(size));
        ctx.fillText(line, center, top + Math.round(size * 0.8));
      },
    };
  }

  if (label.description) {
    // As many lines as fit once everything else has its room, up to the
    // shape's limit.
    const size = shape.descriptionSize;
    const others = [...blocks, sizeBlock, code].filter(
      (block): block is Block => block !== null,
    );
    const room =
      height -
      shape.padY * 2 -
      others.reduce((sum, block) => sum + block.height + shape.gap, 0);
    const maxLines = Math.min(
      shape.maxDescriptionLines,
      Math.max(1, Math.floor((room + LINE_GAP) / (size + LINE_GAP))),
    );
    const font = `600 ${size}px ${sans}`;
    ctx.font = font;
    const lines = wrapText(
      label.description,
      columnWidth,
      (text) => ctx.measureText(text).width,
      maxLines,
    );
    blocks.push({
      height: lines.length * size + (lines.length - 1) * LINE_GAP,
      draw: (top) => {
        ctx.font = font;
        lines.forEach((line, i) =>
          ctx.fillText(
            line,
            center,
            top + i * (size + LINE_GAP) + Math.round(size * 0.8),
          ),
        );
      },
    });
  }
  if (sizeBlock) blocks.push(sizeBlock);
  blocks.push(code);

  drawStack(blocks, shape.padY, height - shape.padY, shape.gap);

  const pixels = ctx.getImageData(0, 0, width, height);
  return thresholdPixels(pixels.data, width, height);
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG failed"))),
      "image/png",
    ),
  );
}
