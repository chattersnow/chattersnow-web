import { describe, expect, test } from "bun:test";
import { compressBuffers, lzmaCompress, printSpeed } from "./compress";

/**
 * A plain LZMA1 decoder, written from the format's specification rather than
 * from the encoder, so a mistake in one is not repeated in the other. It
 * reads what the encoder writes -- literals and plain matches -- and fails on
 * a repeat-distance match, which the encoder never emits.
 */
function lzmaDecompress(input: Uint8Array): Uint8Array {
  const props = input[0];
  const lc = props % 9;
  const lp = Math.floor(props / 9) % 5;
  const pb = Math.floor(props / 45);
  const view = new DataView(input.buffer, input.byteOffset);
  const dictSize = view.getUint32(1, true);
  const size = Number(view.getBigUint64(5, true));
  const out = new Uint8Array(size);

  let at = 13;
  if (input[at++] !== 0) throw new Error("stream must start with 0");
  let range = 0xffffffff;
  let code = 0;
  for (let i = 0; i < 4; i++) code = ((code << 8) | input[at++]) >>> 0;
  const normalize = () => {
    if (range < 1 << 24) {
      range = (range << 8) >>> 0;
      code = ((code << 8) | input[at++]) >>> 0;
    }
  };
  const bit = (probs: Uint16Array, i: number) => {
    const bound = (range >>> 11) * probs[i];
    let result: number;
    if (code < bound) {
      range = bound;
      probs[i] += (2048 - probs[i]) >> 5;
      result = 0;
    } else {
      code -= bound;
      range -= bound;
      probs[i] -= probs[i] >> 5;
      result = 1;
    }
    normalize();
    return result;
  };
  const tree = (probs: Uint16Array, base: number, bits: number) => {
    let m = 1;
    for (let i = 0; i < bits; i++) m = (m << 1) | bit(probs, base + m);
    return m - (1 << bits);
  };
  const reverse = (probs: Uint16Array, base: number, bits: number) => {
    let m = 1;
    let symbol = 0;
    for (let i = 0; i < bits; i++) {
      const b = bit(probs, base + m);
      m = (m << 1) | b;
      symbol |= b << i;
    }
    return symbol;
  };
  const probs = (n: number) => new Uint16Array(n).fill(1024);
  const isMatch = probs(192);
  const isRep = probs(12);
  const literal = probs(0x300 << (lc + lp));
  const slots = probs(256);
  const special = probs(114);
  const align = probs(16);
  const choice = probs(2);
  const low = probs(128);
  const mid = probs(128);
  const high = probs(256);
  const length = (posState: number) => {
    if (bit(choice, 0) === 0) return tree(low, posState << 3, 3);
    if (bit(choice, 1) === 0) return 8 + tree(mid, posState << 3, 3);
    return 16 + tree(high, 0, 8);
  };

  let state = 0;
  let rep0 = 0;
  let pos = 0;
  while (pos < size) {
    const posState = pos & ((1 << pb) - 1);
    if (bit(isMatch, (state << 4) + posState) === 0) {
      const previous = pos > 0 ? out[pos - 1] : 0;
      const base =
        0x300 * (((pos & ((1 << lp) - 1)) << lc) + (previous >> (8 - lc)));
      let symbol = 1;
      if (state >= 7) {
        let matchByte = out[pos - rep0 - 1];
        do {
          const matchBit = (matchByte >> 7) & 1;
          matchByte <<= 1;
          const b = bit(literal, base + ((1 + matchBit) << 8) + symbol);
          symbol = (symbol << 1) | b;
          if (matchBit !== b) break;
        } while (symbol < 0x100);
      }
      while (symbol < 0x100)
        symbol = (symbol << 1) | bit(literal, base + symbol);
      out[pos++] = symbol & 0xff;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    if (bit(isRep, state) === 1) throw new Error("unexpected repeat match");
    const len = length(posState) + 2;
    const slot = tree(slots, Math.min(len - 2, 3) << 6, 6);
    let distance = slot;
    if (slot >= 4) {
      const footer = (slot >> 1) - 1;
      distance = (2 | (slot & 1)) << footer;
      if (slot < 14) {
        distance += reverse(special, distance - slot - 1, footer);
      } else {
        let direct = 0;
        for (let i = 0; i < footer - 4; i++) {
          range >>>= 1;
          const b = code >= range ? 1 : 0;
          if (b) code -= range;
          direct = (direct << 1) | b;
          normalize();
        }
        distance += (direct << 4) + reverse(align, 0, 4);
      }
    }
    if (distance >= dictSize || distance >= pos) {
      throw new Error(`distance ${distance} is out of reach at ${pos}`);
    }
    rep0 = distance;
    state = state < 7 ? 7 : 10;
    for (let i = 0; i < len; i++, pos++) out[pos] = out[pos - distance - 1];
  }
  return out;
}

function pseudoRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 16) & 0xff;
  };
}

describe("lzmaCompress", () => {
  test("writes the firmware's header: lc=3 lp=0 pb=2, 8 KiB dictionary, the size", () => {
    const out = lzmaCompress(new Uint8Array(4096));
    expect([...out.subarray(0, 5)]).toEqual([0x5d, 0x00, 0x20, 0x00, 0x00]);
    const view = new DataView(out.buffer);
    expect(view.getBigUint64(5, true)).toBe(BigInt(4096));
  });

  // Checked with liblzma (Python's `lzma`, FORMAT_ALONE) when it was pinned.
  // A change here means the encoder changed: decode the new output with an
  // independent LZMA implementation before updating it.
  test("golden bytes", () => {
    const text = new TextEncoder().encode(`${"supvan ".repeat(20)}label`);
    const input = new Uint8Array(text.length + 300);
    input.set(text);
    expect(Buffer.from(lzmaCompress(input)).toString("hex")).toBe(
      "5d00200000bd0100000000000000399d4a45b14f4d4601618613470a45d5c74f034e155d2d00",
    );
  });

  test("round-trips random, sparse, repeating and empty data", () => {
    const rnd = pseudoRandom(7);
    const cases: Uint8Array[] = [new Uint8Array(0), new Uint8Array([42])];
    for (let c = 0; c < 12; c++) {
      const data = new Uint8Array(500 + ((c * 1543) % 16000));
      for (let i = 0; i < data.length; i++) {
        data[i] =
          c % 3 === 0
            ? rnd()
            : c % 3 === 1
              ? rnd() < 20
                ? rnd()
                : 0
              : i >= 48 && rnd() < 240
                ? data[i - 48]
                : rnd() & 0x0f;
      }
      cases.push(data);
    }
    for (const data of cases) {
      expect(lzmaDecompress(lzmaCompress(data))).toEqual(data);
    }
  });

  test("never reaches back further than the dictionary", () => {
    // A pattern that recurs only 9000 bytes later must be sent again.
    const rnd = pseudoRandom(3);
    const data = new Uint8Array(12000);
    for (let i = 0; i < 1000; i++) data[i] = rnd();
    data.set(data.subarray(0, 1000), 10000);
    expect(lzmaDecompress(lzmaCompress(data))).toEqual(data);
  });
});

describe("compressBuffers", () => {
  test("packs up to four buffers per block", () => {
    const { blocks, averageSize } = compressBuffers(
      Array.from({ length: 9 }, () => new Uint8Array(4096)),
    );
    expect(blocks).toHaveLength(3);
    expect(averageSize).toBeGreaterThan(0);
  });

  test("splits a group whose compressed size would overrun 4096 bytes", () => {
    const rnd = pseudoRandom(11);
    const buffers = Array.from({ length: 4 }, () =>
      new Uint8Array(4096).map(() => rnd()),
    );
    const { blocks } = compressBuffers(buffers);
    expect(blocks).toHaveLength(4);
    const joined = blocks.flatMap((block) => [...lzmaDecompress(block)]);
    expect(joined).toEqual(buffers.flatMap((buffer) => [...buffer]));
  });
});

test("printSpeed slows down for denser labels", () => {
  expect(printSpeed(100)).toBe(60);
  expect(printSpeed(1200)).toBe(45);
  expect(printSpeed(3500)).toBe(10);
});
