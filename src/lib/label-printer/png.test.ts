import { deflateSync } from "node:zlib";
import { expect, test } from "bun:test";
import { withResolution } from "./png";
import { crc32 } from "./zip";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A 1 × 1 greyscale PNG as a canvas writes one: IHDR, IDAT, IEND. */
const ONE_PIXEL = (() => {
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, 1);
  new DataView(header.buffer).setUint32(4, 1);
  header[8] = 8; // bit depth; colour type 0 is greyscale
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Uint8Array.of(0, 255))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
})();

function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const found: { type: string; data: Uint8Array; crcOk: boolean }[] = [];
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    const crc = view.getUint32(at + 8 + length);
    found.push({
      type,
      data,
      crcOk: crc === crc32(png.subarray(at + 4, at + 8 + length)),
    });
    at += 12 + length;
  }
  return found;
}

test("adds a pHYs chunk after IHDR saying 8 dots per millimetre", () => {
  const stamped = withResolution(ONE_PIXEL, 8);
  const found = chunks(stamped);
  expect(found.map((chunk) => chunk.type)).toEqual([
    "IHDR",
    "pHYs",
    "IDAT",
    "IEND",
  ]);
  expect(found.every((chunk) => chunk.crcOk)).toBe(true);
  const phys = new DataView(found[1].data.buffer, found[1].data.byteOffset);
  expect(phys.getUint32(0)).toBe(8000);
  expect(phys.getUint32(4)).toBe(8000);
  expect(found[1].data[8]).toBe(1);
});

test("leaves a PNG that already has a resolution alone", () => {
  const once = withResolution(ONE_PIXEL, 8);
  expect(withResolution(once, 12)).toBe(once);
});
