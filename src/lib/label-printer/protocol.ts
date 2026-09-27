/**
 * The Supvan T50-family wire vocabulary (#1447): command codes, the two
 * command framings, the 512-byte data frames, and the status and loaded-label
 * replies.
 *
 * Ported from supvan-cups (`supvan-proto/src/{cmd,data,status,usb_transport}.rs`,
 * MIT, © 2026 Florian Hänel; see THIRD_PARTY_LICENSE). Its `docs/PROTOCOL.md`
 * is the reference for every offset here.
 *
 * The two transports share the command codes and nothing else: Bluetooth
 * frames a command in 16 bytes behind `7E 5A` with little-endian parameters,
 * USB in 8 or 10 bytes behind `C0 40` with big-endian ones, and their replies
 * put the same status bits at different offsets.
 */

export const CMD = {
  BUF_FULL: 0x10,
  INQUIRY_STA: 0x11,
  CHECK_DEVICE: 0x12,
  START_PRINT: 0x13,
  STOP_PRINT: 0x14,
  RETURN_MAT: 0x30,
  NEXT_ZIPPEDBULK: 0x5c,
} as const;

const BT_MAGIC1 = 0x7e;
const BT_MAGIC2 = 0x5a;
const PROTO_ID = 0x10;
const PROTO_VER = 0x01;
const DATA_TYPE = 0x02;

/** Bluetooth: a start-transfer frame, whose two parameters fill bytes 12-15. */
export function btCommand(cmd: number, param1 = 0, param2 = 0): Uint8Array {
  const frame = new Uint8Array(16);
  frame[0] = BT_MAGIC1;
  frame[1] = BT_MAGIC2;
  frame[2] = 0x0c; // payload length, 12
  frame[4] = PROTO_ID;
  frame[5] = PROTO_VER;
  frame[6] = 0xaa;
  frame[7] = cmd;
  frame[11] = 0x01;
  frame[12] = param1 & 0xff;
  frame[13] = (param1 >> 8) & 0xff;
  frame[14] = param2 & 0xff;
  frame[15] = (param2 >> 8) & 0xff;
  let checksum = 0;
  for (let i = 10; i < 16; i++) checksum += frame[i];
  frame[8] = checksum & 0xff;
  frame[9] = (checksum >> 8) & 0xff;
  return frame;
}

/** USB: 8 bytes, or 10 when the command takes a second parameter. */
export function usbCommand(
  cmd: number,
  param1 = 0,
  param2?: number,
): Uint8Array {
  const frame = new Uint8Array(param2 === undefined ? 8 : 10);
  frame[0] = 0xc0;
  frame[1] = 0x40;
  frame[2] = (param1 >> 8) & 0xff;
  frame[3] = param1 & 0xff;
  frame[4] = cmd;
  frame[6] = 0x08;
  if (param2 !== undefined) {
    frame[8] = (param2 >> 8) & 0xff;
    frame[9] = param2 & 0xff;
  }
  return frame;
}

/** Compressed bytes carried by one Bluetooth data frame. */
export const DATA_PAYLOAD_SIZE = 500;

/**
 * Bluetooth bulk data: 500-byte slices, each in a 506-byte `AA BB` packet
 * (checksummed, numbered) inside a 512-byte `7E 5A` frame.
 */
export function btDataFrames(compressed: Uint8Array): Uint8Array[] {
  const total = Math.ceil(compressed.length / DATA_PAYLOAD_SIZE);
  const frames: Uint8Array[] = [];
  for (let index = 0; index < total; index++) {
    const frame = new Uint8Array(512);
    frame[0] = BT_MAGIC1;
    frame[1] = BT_MAGIC2;
    frame[2] = 508 & 0xff;
    frame[3] = 508 >> 8;
    frame[4] = PROTO_ID;
    frame[5] = DATA_TYPE;
    const packet = frame.subarray(6);
    packet[0] = 0xaa;
    packet[1] = 0xbb;
    packet[4] = index;
    packet[5] = total;
    packet.set(
      compressed.subarray(
        index * DATA_PAYLOAD_SIZE,
        (index + 1) * DATA_PAYLOAD_SIZE,
      ),
      6,
    );
    let checksum = 0;
    for (let i = 4; i < packet.length; i++) checksum += packet[i];
    packet[2] = checksum & 0xff;
    packet[3] = (checksum >> 8) & 0xff;
    frames.push(frame);
  }
  return frames;
}

export type PrinterStatus = {
  bufferFull: boolean;
  printing: boolean;
  busy: boolean;
  /** What is wrong, in words a volunteer can act on; empty when nothing is. */
  errors: string[];
};

/** The four status registers, which both transports carry in the same bits. */
function decodeStatus(
  mstaLow: number,
  mstaHigh: number,
  fstaLow: number,
  fstaHigh: number,
): PrinterStatus {
  const errors: string[] = [];
  if (mstaLow & 0x02) errors.push("The printer can't read the label roll.");
  if (mstaLow & 0x04) errors.push("The label roll has run out.");
  if (mstaLow & 0x08) errors.push("The loaded labels don't match the job.");
  if (fstaLow & 0x08) errors.push("The printer's cover is open.");
  if (mstaHigh & 0x08) errors.push("The printhead is too hot. Let it cool.");
  if (fstaHigh & 0x01) errors.push("No labels are loaded.");
  return {
    bufferFull: (mstaLow & 0x01) !== 0,
    busy: (mstaHigh & 0x04) !== 0,
    printing: (fstaLow & 0x40) !== 0,
    errors,
  };
}

/** A Bluetooth reply answers `cmd` when it echoes it at byte 7. */
export function btReplyMatches(reply: Uint8Array, cmd: number): boolean {
  return (
    reply.length >= 8 &&
    reply[0] === BT_MAGIC1 &&
    reply[1] === BT_MAGIC2 &&
    reply[7] === cmd
  );
}

export function parseBtStatus(reply: Uint8Array): PrinterStatus | null {
  if (reply.length < 20 || !btReplyMatches(reply, CMD.INQUIRY_STA)) {
    return null;
  }
  return decodeStatus(reply[14], reply[15], reply[16], reply[17]);
}

/** USB replies are 8 bytes, with no command echo and no framing. */
export function parseUsbStatus(reply: Uint8Array): PrinterStatus | null {
  if (reply.length < 7) return null;
  return decodeStatus(reply[1], reply[2], reply[3], reply[4]);
}

/** The loaded label stock, as its RFID tag describes it. */
export type LoadedLabels = {
  /** Across the printhead. */
  widthMm: number;
  /** Along the feed. */
  heightMm: number;
};

function parseMaterialPayload(payload: Uint8Array): LoadedLabels | null {
  if (payload.length < 21) return null;
  return { widthMm: payload[18], heightMm: payload[19] };
}

export function parseBtMaterial(reply: Uint8Array): LoadedLabels | null {
  if (reply.length < 22 || !btReplyMatches(reply, CMD.RETURN_MAT)) return null;
  return parseMaterialPayload(reply.subarray(22));
}

/** USB prefixes the same payload with one length byte. */
export function parseUsbMaterial(reply: Uint8Array): LoadedLabels | null {
  return parseMaterialPayload(reply.subarray(1));
}
