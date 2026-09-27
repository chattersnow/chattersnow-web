/**
 * The printer's 4096-byte print buffers (#1447): a 14-byte header and up to
 * 4074 bytes of printhead lines.
 *
 * Ported from supvan-cups (`supvan-proto/src/buffer.rs`, MIT, © 2026 Florian
 * Hänel; see THIRD_PARTY_LICENSE).
 */

export const PRINT_BUF_SIZE = 4096;
const PRINT_BUF_HEADER = 14;
const MAX_BUF_DATA = 4074;

/** The vendor's default burn energy on its 0-15 scale. */
export const DEFAULT_DENSITY = 4;

type BufferParams = {
  lines: Uint8Array;
  lineCount: number;
  bytesPerLine: number;
  first: boolean;
  last: boolean;
  density: number;
};

/**
 * Header layout: checksum (LE), PAGE_REG_BITS, line count (LE), bytes per
 * line, reserved, top and bottom margin (LE, 1-900 dots), red density, 0.
 */
function buildPrintBuffer(p: BufferParams): Uint8Array {
  const buf = new Uint8Array(PRINT_BUF_SIZE);
  const density = Math.min(Math.max(p.density, 0), 15);
  // PAGE_REG_BITS: page start, page end and job end in byte 0; the black
  // density and material type (1) in byte 1.
  buf[2] = (p.first ? 0x02 : 0) | (p.last ? 0x04 | 0x08 : 0);
  buf[3] = (density << 2) | (1 << 6);
  buf[4] = p.lineCount & 0xff;
  buf[5] = p.lineCount >> 8;
  buf[6] = p.bytesPerLine;
  // Margins are clamped to at least 1 by the firmware's rules; the image
  // carries its own.
  buf[8] = 1;
  buf[10] = 1;
  buf[12] = density;
  buf.set(p.lines.subarray(0, PRINT_BUF_SIZE - PRINT_BUF_HEADER), 14);

  // The sum of the header, plus the byte before each 256-byte boundary the
  // image data reaches.
  let checksum = 0;
  for (let i = 2; i < PRINT_BUF_HEADER; i++) checksum += buf[i];
  const dataEnd = p.lineCount * p.bytesPerLine + PRINT_BUF_HEADER;
  for (let i = 1; i <= Math.floor(dataEnd / 256); i++) {
    checksum += buf[i * 256 - 1];
  }
  buf[0] = checksum & 0xff;
  buf[1] = (checksum >> 8) & 0xff;
  return buf;
}

/** One page's printhead lines, tiled into as many buffers as they need. */
export function splitIntoBuffers(
  lines: Uint8Array,
  lineCount: number,
  bytesPerLine: number,
  density = DEFAULT_DENSITY,
): Uint8Array[] {
  const perBuffer = Math.floor(MAX_BUF_DATA / bytesPerLine);
  const count = Math.ceil(lineCount / perBuffer);
  const buffers: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * perBuffer;
    const inBuffer = Math.min(perBuffer, lineCount - start);
    buffers.push(
      buildPrintBuffer({
        lines: lines.subarray(
          start * bytesPerLine,
          (start + inBuffer) * bytesPerLine,
        ),
        lineCount: inBuffer,
        bytesPerLine,
        first: i === 0,
        last: i === count - 1,
        density,
      }),
    );
  }
  return buffers;
}
