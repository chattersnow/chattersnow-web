/**
 * LZMA compression for the printer's firmware (#1447).
 *
 * The printer takes its print buffers as LZMA1 "alone" streams with the
 * vendor's parameters: lc=3, lp=0, pb=2 and an 8 KiB dictionary, which is all
 * the firmware has room for (supvan-cups, `compress.rs`, from the Android
 * app's `LzmaUtils`). No small JavaScript encoder lets that dictionary be set,
 * so this is a minimal encoder written for it: greedy hash-chain matching,
 * literals and plain matches only, never a repeat-distance shortcut. That
 * costs some compression, which a 50 x 30 mm label never needs -- it stays far
 * below the firmware's 4096-byte block limit.
 *
 * The stream carries its uncompressed size in the header and no end marker,
 * which is what the vendor's Java encoder writes.
 *
 * The grouping of buffers into blocks and the print speed are ported from
 * supvan-cups (`supvan-proto/src/{compress,speed}.rs`, MIT, © 2026 Florian
 * Hänel; see THIRD_PARTY_LICENSE).
 */

const LC = 3;
const PB = 2;
const DICT_SIZE = 8192;
const MIN_MATCH = 3;
const MAX_MATCH = 273;
const CHAIN_DEPTH = 48;
const HASH_BITS = 16;

const BIT_MODEL_TOTAL = 1 << 11;
const TOP = 1 << 24;

class RangeEncoder {
  // Up to 33 bits, so a plain number rather than a 32-bit integer.
  private low = 0;
  private range = 0xffffffff;
  private cache = 0;
  private cacheSize = 1;
  readonly out: number[] = [];

  private shiftLow() {
    if (this.low < 0xff000000 || this.low >= 0x100000000) {
      const carry = this.low >= 0x100000000 ? 1 : 0;
      let byte = this.cache;
      do {
        this.out.push((byte + carry) & 0xff);
        byte = 0xff;
      } while (--this.cacheSize !== 0);
      this.cache = Math.floor(this.low / TOP) & 0xff;
    }
    this.cacheSize++;
    this.low = (this.low % TOP) * 256;
  }

  bit(probs: Uint16Array, index: number, bit: number) {
    const p = probs[index];
    const bound = (this.range >>> 11) * p;
    if (bit === 0) {
      this.range = bound;
      probs[index] = p + ((BIT_MODEL_TOTAL - p) >> 5);
    } else {
      this.low += bound;
      this.range -= bound;
      probs[index] = p - (p >> 5);
    }
    while (this.range < TOP) {
      this.range *= 256;
      this.shiftLow();
    }
  }

  direct(value: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      this.range = this.range >>> 1;
      if ((value >>> i) & 1) this.low += this.range;
      while (this.range < TOP) {
        this.range *= 256;
        this.shiftLow();
      }
    }
  }

  tree(probs: Uint16Array, base: number, bits: number, symbol: number) {
    let m = 1;
    for (let i = bits - 1; i >= 0; i--) {
      const bit = (symbol >>> i) & 1;
      this.bit(probs, base + m, bit);
      m = (m << 1) | bit;
    }
  }

  reverseTree(probs: Uint16Array, base: number, bits: number, symbol: number) {
    let m = 1;
    for (let i = 0; i < bits; i++) {
      const bit = symbol & 1;
      this.bit(probs, base + m, bit);
      m = (m << 1) | bit;
      symbol >>>= 1;
    }
  }

  flush() {
    for (let i = 0; i < 5; i++) this.shiftLow();
  }
}

const probs = (size: number) => new Uint16Array(size).fill(BIT_MODEL_TOTAL / 2);

class LengthEncoder {
  private choice = probs(2);
  private low = probs(16 << 3);
  private mid = probs(16 << 3);
  private high = probs(256);

  encode(rc: RangeEncoder, length: number, posState: number) {
    let symbol = length - MIN_LENGTH_CODED;
    if (symbol < 8) {
      rc.bit(this.choice, 0, 0);
      rc.tree(this.low, posState << 3, 3, symbol);
      return;
    }
    rc.bit(this.choice, 0, 1);
    symbol -= 8;
    if (symbol < 8) {
      rc.bit(this.choice, 1, 0);
      rc.tree(this.mid, posState << 3, 3, symbol);
    } else {
      rc.bit(this.choice, 1, 1);
      rc.tree(this.high, 0, 8, symbol - 8);
    }
  }
}

/** The shortest length LZMA's length coder counts from. */
const MIN_LENGTH_CODED = 2;

function posSlot(distance: number): number {
  if (distance < 4) return distance;
  const top = 31 - Math.clz32(distance);
  return (top << 1) | ((distance >>> (top - 1)) & 1);
}

/** LZMA1 "alone": a 13-byte header, then the range-coded stream. */
export function lzmaCompress(data: Uint8Array): Uint8Array {
  const rc = new RangeEncoder();
  const isMatch = probs(12 << 4);
  const isRep = probs(12);
  const literal = probs(0x300 << LC);
  const slots = probs(4 << 6);
  const special = probs(114);
  const align = probs(16);
  const lengths = new LengthEncoder();

  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const chain = new Int32Array(data.length).fill(-1);
  const hash = (i: number) =>
    ((data[i] << 8) ^ (data[i + 1] << 4) ^ (data[i + 2] * 0x9e5)) &
    ((1 << HASH_BITS) - 1);
  const insert = (i: number) => {
    if (i + MIN_MATCH > data.length) return;
    const h = hash(i);
    chain[i] = head[h];
    head[h] = i;
  };

  let state = 0;
  let rep0 = 0;
  let pos = 0;
  while (pos < data.length) {
    const posState = pos & ((1 << PB) - 1);

    let bestLength = 0;
    let bestDistance = 0;
    if (pos + MIN_MATCH <= data.length) {
      const limit = Math.min(MAX_MATCH, data.length - pos);
      let candidate = head[hash(pos)];
      for (
        let depth = 0;
        candidate >= 0 && pos - candidate <= DICT_SIZE && depth < CHAIN_DEPTH;
        depth++, candidate = chain[candidate]
      ) {
        let length = 0;
        while (
          length < limit &&
          data[candidate + length] === data[pos + length]
        ) {
          length++;
        }
        if (length > bestLength) {
          bestLength = length;
          bestDistance = pos - candidate - 1;
          if (length === limit) break;
        }
      }
    }

    if (bestLength >= MIN_MATCH) {
      rc.bit(isMatch, (state << 4) + posState, 1);
      rc.bit(isRep, state, 0);
      lengths.encode(rc, bestLength, posState);
      const slot = posSlot(bestDistance);
      const lengthState = Math.min(bestLength - MIN_LENGTH_CODED, 3);
      rc.tree(slots, lengthState << 6, 6, slot);
      if (slot >= 4) {
        const footerBits = (slot >>> 1) - 1;
        const base = (2 | (slot & 1)) << footerBits;
        const reduced = bestDistance - base;
        if (slot < 14) {
          rc.reverseTree(special, base - slot - 1, footerBits, reduced);
        } else {
          rc.direct(reduced >>> 4, footerBits - 4);
          rc.reverseTree(align, 0, 4, reduced & 15);
        }
      }
      rep0 = bestDistance;
      state = state < 7 ? 7 : 10;
      for (let i = 0; i < bestLength; i++) insert(pos + i);
      pos += bestLength;
      continue;
    }

    rc.bit(isMatch, (state << 4) + posState, 0);
    const previous = pos > 0 ? data[pos - 1] : 0;
    const base = 0x300 * (previous >> (8 - LC));
    let symbol = data[pos] | 0x100;
    if (state < 7) {
      do {
        rc.bit(literal, base + (symbol >> 8), (symbol >> 7) & 1);
        symbol <<= 1;
      } while (symbol < 0x10000);
    } else {
      // After a match the decoder predicts from the byte the match would
      // have continued with.
      let matchByte = data[pos - rep0 - 1];
      let offset = 0x100;
      do {
        matchByte <<= 1;
        rc.bit(
          literal,
          base + offset + (matchByte & offset) + (symbol >> 8),
          (symbol >> 7) & 1,
        );
        symbol <<= 1;
        offset &= ~(matchByte ^ symbol);
      } while (symbol < 0x10000);
    }
    state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
    insert(pos);
    pos++;
  }
  rc.flush();

  const out = new Uint8Array(13 + rc.out.length);
  out[0] = (PB * 5 + 0) * 9 + LC; // lc=3, lp=0, pb=2: 0x5D
  new DataView(out.buffer).setUint32(1, DICT_SIZE, true);
  new DataView(out.buffer).setBigUint64(5, BigInt(data.length), true);
  out.set(rc.out, 13);
  return out;
}

/** The firmware's receive buffer: no compressed block may be larger. */
const MAX_COMPRESSED_BLOCK = 4096;

/** The most print buffers the vendor packs into one block. */
const BUFFERS_PER_BLOCK = 4;

/**
 * Pack up to four buffers per block, fewer when four don't fit the receive
 * buffer compressed. Returns the blocks and the mean compressed bytes per
 * buffer, which sets the print speed.
 */
export function compressBuffers(buffers: Uint8Array[]): {
  blocks: Uint8Array[];
  averageSize: number;
} {
  const blocks: Uint8Array[] = [];
  let next = 0;
  while (next < buffers.length) {
    let take = Math.min(BUFFERS_PER_BLOCK, buffers.length - next);
    for (;;) {
      const group = concat(buffers.slice(next, next + take));
      const block = lzmaCompress(group);
      if (block.length <= MAX_COMPRESSED_BLOCK || take === 1) {
        blocks.push(block);
        break;
      }
      take--;
    }
    next += take;
  }
  const total = blocks.reduce((sum, block) => sum + block.length, 0);
  return {
    blocks,
    averageSize: Math.floor(total / Math.max(buffers.length, 1)),
  };
}

/** Slower for denser labels, so the head has time to heat. */
export function printSpeed(averageSize: number): number {
  if (averageSize > 3000) return 10;
  if (averageSize > 2800) return 15;
  if (averageSize > 2500) return 20;
  if (averageSize > 2000) return 25;
  if (averageSize > 1500) return 40;
  if (averageSize > 1000) return 45;
  if (averageSize > 500) return 55;
  return 60;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
