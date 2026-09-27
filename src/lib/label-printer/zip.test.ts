import { expect, test } from "bun:test";
import { crc32, storedZip } from "./zip";

test("crc32 matches the standard check value", () => {
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});

test("storedZip lays out local headers, the directory and its end record", () => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([4, 5]);
  const zip = storedZip([
    { name: "A1.png", data: a },
    { name: "B2.png", data: b },
  ]);
  const view = new DataView(zip.buffer);

  expect(view.getUint32(0, true)).toBe(0x04034b50);
  expect(view.getUint16(8, true)).toBe(0); // stored, not deflated
  expect(view.getUint32(14, true)).toBe(crc32(a));
  expect([...zip.subarray(36, 39)]).toEqual([1, 2, 3]);

  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(2);
  const directory = view.getUint32(end + 16, true);
  expect(directory).toBe(30 + 6 + 3 + 30 + 6 + 2);
  expect(view.getUint32(directory, true)).toBe(0x02014b50);
  // The second entry's local header offset.
  expect(view.getUint32(directory + 46 + 6 + 42, true)).toBe(39);
});
