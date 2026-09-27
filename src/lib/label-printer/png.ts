import { crc32 } from "./zip";

/**
 * A PNG stamped with its print resolution (a `pHYs` chunk), so an app that
 * reads it places a label image at its real size rather than guessing one.
 * A canvas's PNG carries none. A PNG that already has one is returned as it
 * is, since the format allows only one.
 */
export function withResolution(png: Uint8Array, dotsPerMm: number): Uint8Array {
  // The 8-byte signature, then IHDR: length, type, 13 bytes, CRC.
  const afterHeader = 8 + 4 + 4 + 13 + 4;
  if (hasChunk(png, "pHYs")) return png;

  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set(new TextEncoder().encode("pHYs"), 4);
  const perMetre = Math.round(dotsPerMm * 1000);
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1; // the unit is the metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, afterHeader));
  out.set(chunk, afterHeader);
  out.set(png.subarray(afterHeader), afterHeader + chunk.length);
  return out;
}

function hasChunk(png: Uint8Array, type: string): boolean {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const decoder = new TextDecoder();
  for (let at = 8; at + 8 <= png.length;) {
    const length = view.getUint32(at);
    const name = decoder.decode(png.subarray(at + 4, at + 8));
    if (name === type) return true;
    if (name === "IDAT" || name === "IEND") return false;
    at += 12 + length;
  }
  return false;
}
