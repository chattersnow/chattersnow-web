import { expect, test } from "bun:test";
import { PRINTHEAD_DOTS, bitmapBytesPerRow, toPrintheadLines } from "./bitmap";
import { splitIntoBuffers } from "./buffer";

function blank(width: number, height: number) {
  return {
    width,
    height,
    data: new Uint8Array(bitmapBytesPerRow(width) * height),
  };
}

function set(bitmap: ReturnType<typeof blank>, x: number, y: number) {
  bitmap.data[y * bitmapBytesPerRow(bitmap.width) + (x >> 3)] |=
    0x80 >> (x & 7);
}

const dotAt = (line: Uint8Array, dot: number) =>
  ((line[dot >> 3] >> (dot & 7)) & 1) === 1;

test("each image row becomes one printhead line, least significant bit first", () => {
  const bitmap = blank(PRINTHEAD_DOTS, 2);
  set(bitmap, 0, 0);
  set(bitmap, 9, 1);
  const { data, lines, bytesPerLine } = toPrintheadLines(bitmap);
  expect([lines, bytesPerLine]).toEqual([2, 48]);
  expect(data[0]).toBe(0x01);
  expect(data[48 + 1]).toBe(0x02);
});

test("a 50 mm label loses the same millimetre off each side of the 48 mm head", () => {
  const bitmap = blank(400, 1);
  for (const x of [0, 7, 8, 391, 392, 399]) set(bitmap, x, 0);
  const { data } = toPrintheadLines(bitmap);
  const lit = [...Array(PRINTHEAD_DOTS).keys()].filter((dot) =>
    dotAt(data, dot),
  );
  expect(lit).toEqual([0, 383]);
});

test("a narrower image is centred on the head", () => {
  const bitmap = blank(16, 1);
  set(bitmap, 0, 0);
  const { data } = toPrintheadLines(bitmap);
  expect(dotAt(data, (PRINTHEAD_DOTS - 16) / 2)).toBe(true);
});

test("a 30 mm label is three buffers, flagged first and last", () => {
  const { data, lines, bytesPerLine } = toPrintheadLines(blank(400, 240));
  const buffers = splitIntoBuffers(data, lines, bytesPerLine);
  expect(buffers).toHaveLength(3);
  expect(buffers.every((buffer) => buffer.length === 4096)).toBe(true);
  // 4074 bytes of data hold 84 lines of 48 bytes: 84 + 84 + 72.
  expect(buffers.map((b) => b[4] | (b[5] << 8))).toEqual([84, 84, 72]);
  expect(buffers.map((b) => b[2])).toEqual([0x02, 0x00, 0x0c]);
  // Density 4 in bits 2-5, material 1 in bits 6-7.
  expect(buffers[0][3]).toBe((4 << 2) | 0x40);
  expect([
    buffers[0][6],
    buffers[0][8],
    buffers[0][10],
    buffers[0][12],
  ]).toEqual([48, 1, 1, 4]);
});

test("the buffer checksum adds the header and each 256th byte of data", () => {
  const lines = new Uint8Array(48 * 10).fill(0x01);
  const [buffer] = splitIntoBuffers(lines, 10, 48);
  let expected = 0;
  for (let i = 2; i < 14; i++) expected += buffer[i];
  // 494 bytes of header and data reach one boundary, at byte 255.
  expected += buffer[255];
  expect(buffer[0] | (buffer[1] << 8)).toBe(expected);
});
