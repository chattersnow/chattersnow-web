import { describe, expect, test } from "bun:test";
import {
  CMD,
  btCommand,
  btDataFrames,
  parseBtMaterial,
  parseBtStatus,
  parseUsbMaterial,
  parseUsbStatus,
  usbCommand,
} from "./protocol";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("command frames", () => {
  // The expected bytes are supvan-cups' own (`cmd.rs` tests, PROTOCOL.md).
  test("Bluetooth CHECK_DEVICE: checksum is the sum of bytes 10-15", () => {
    expect(hex(btCommand(CMD.CHECK_DEVICE))).toBe(
      "7e5a0c001001aa120100000100000000",
    );
  });

  test("Bluetooth parameters are little-endian in bytes 12-15", () => {
    const frame = btCommand(CMD.NEXT_ZIPPEDBULK, 512, 3);
    expect([...frame.subarray(12)]).toEqual([0x00, 0x02, 0x03, 0x00]);
    expect(frame[8] | (frame[9] << 8)).toBe(1 + 2 + 3);
  });

  test("USB puts parameters big-endian, with the second after byte 8", () => {
    expect(hex(usbCommand(CMD.INQUIRY_STA))).toBe("c040000011000800");
    expect(hex(usbCommand(CMD.BUF_FULL, 0x1234, 60))).toBe(
      "c040123410000800003c",
    );
  });
});

describe("btDataFrames", () => {
  test("500-byte slices, numbered, each in a 512-byte frame", () => {
    const data = new Uint8Array(1201).map((_, i) => i & 0xff);
    const frames = btDataFrames(data);
    expect(frames).toHaveLength(3);
    for (const [index, frame] of frames.entries()) {
      expect(frame).toHaveLength(512);
      expect(hex(frame.subarray(0, 6))).toBe("7e5afc011002");
      expect([frame[6], frame[7], frame[10], frame[11]]).toEqual([
        0xaa,
        0xbb,
        index,
        3,
      ]);
      let sum = 0;
      for (let i = 10; i < 512; i++) sum += frame[i];
      expect(frame[8] | (frame[9] << 8)).toBe(sum & 0xffff);
    }
    // The last frame holds bytes 1000-1200, then zeros.
    expect(frames[2][12]).toBe(1000 & 0xff);
    expect(frames[2][12 + 200]).toBe(1200 & 0xff);
    expect(frames[2][12 + 201]).toBe(0);
  });
});

describe("status", () => {
  test("USB carries the registers at bytes 1-4", () => {
    const status = parseUsbStatus(
      new Uint8Array([0x08, 0x01, 0x04, 0x40, 0x00, 0, 0, 0]),
    );
    expect(status).toEqual({
      bufferFull: true,
      busy: true,
      printing: true,
      errors: [],
    });
  });

  test("Bluetooth carries them at bytes 14-17 of an INQUIRY_STA reply", () => {
    const reply = new Uint8Array(20);
    reply.set([0x7e, 0x5a, 0x10, 0x00, 0x10, 0x03, 0x55, CMD.INQUIRY_STA]);
    reply[14] = 0x04; // roll end
    reply[16] = 0x08; // cover open
    expect(parseBtStatus(reply)?.errors).toEqual([
      "The label roll has run out.",
      "The printer's cover is open.",
    ]);
    reply[7] = CMD.RETURN_MAT;
    expect(parseBtStatus(reply)).toBeNull();
  });

  test("a short reply is no status", () => {
    expect(parseUsbStatus(new Uint8Array(3))).toBeNull();
  });
});

describe("loaded labels", () => {
  test("USB reports width and height at bytes 19-20", () => {
    const reply = new Uint8Array(64);
    reply[19] = 50;
    reply[20] = 30;
    expect(parseUsbMaterial(reply)).toEqual({ widthMm: 50, heightMm: 30 });
  });

  test("Bluetooth after the 22-byte reply header", () => {
    const reply = new Uint8Array(57);
    reply.set([0x7e, 0x5a, 0x35, 0x00, 0x10, 0x03, 0x55, CMD.RETURN_MAT]);
    reply[22 + 18] = 40;
    reply[22 + 19] = 30;
    expect(parseBtMaterial(reply)).toEqual({ widthMm: 40, heightMm: 30 });
  });
});
