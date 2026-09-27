/**
 * The printer over Bluetooth LE, through Web Bluetooth (#1447): Chrome and
 * Edge on the desktop, Chrome on Android, and Bluefy on an iPhone. The GATT
 * layout and pacing follow supvan-cups (`supvan-proto/src/ble.rs`, MIT,
 * © 2026 Florian Hänel; see THIRD_PARTY_LICENSE), which takes them from the
 * vendor's Android app.
 *
 * Bluetooth carries the 16-byte `7E 5A` command frames and 512-byte data
 * frames, written in 128-byte pieces. A reply arrives as notifications, which
 * may split one frame in several, and answers a command when it echoes the
 * command byte. Data frames are not acknowledged.
 */

import {
  btCommand,
  btDataFrames,
  btReplyMatches,
  CMD,
  parseBtMaterial,
  parseBtStatus,
} from "./protocol";
import {
  PrinterError,
  PrinterPickerCancelled,
  ReplyQueue,
  sleep,
  type Transport,
} from "./transport";

const uuid16 = (short: number) =>
  `0000${short.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;

/** The three service layouts the vendor's app looks for, first match wins. */
const SERVICES = [
  {
    service: "0000e0ff-3c17-d293-8e48-14fe2e4da212",
    notify: uuid16(0xffe1),
    write: uuid16(0xffe9),
  },
  { service: uuid16(0xfee7), notify: uuid16(0xfec1), write: uuid16(0xfec1) },
  { service: uuid16(0xff00), notify: uuid16(0xff01), write: uuid16(0xff02) },
];

const CHUNK = 128;
const CHUNK_DELAY_MS = 10;
const REPLY_TIMEOUT_MS = 4000;
/** Bluetooth data frames carry this block size in the announcement. */
const BLOCK_SIZE = 512;

export function webBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function connectBluetoothPrinter(): Promise<Transport> {
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({
      // A T50M Pro advertises its serial ("T0117A...") as its name; the
      // service filters catch a unit that advertises its service instead.
      filters: [
        { namePrefix: "T" },
        ...SERVICES.map(({ service }) => ({ services: [service] })),
      ],
      optionalServices: SERVICES.map(({ service }) => service),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new PrinterPickerCancelled();
    }
    throw error;
  }
  const server = await device.gatt!.connect();
  for (const layout of SERVICES) {
    const service = await server
      .getPrimaryService(layout.service)
      .catch(() => null);
    if (!service) continue;
    const notify = await service.getCharacteristic(layout.notify);
    const write =
      layout.write === layout.notify
        ? notify
        : await service.getCharacteristic(layout.write);
    const transport = new BleTransport(device, notify, write);
    await transport.start();
    return transport;
  }
  device.gatt!.disconnect();
  throw new PrinterError(
    "That device isn't a label printer this page can drive.",
  );
}

class BleTransport implements Transport {
  readonly kind = "bluetooth";
  private replies = new ReplyQueue();
  /** A reply frame still arriving in pieces. */
  private partial: Uint8Array | null = null;
  private onNotify = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    this.receive(
      new Uint8Array(
        value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ),
      ),
    );
  };

  constructor(
    private device: BluetoothDevice,
    private notify: BluetoothRemoteGATTCharacteristic,
    private writer: BluetoothRemoteGATTCharacteristic,
  ) {}

  async start() {
    this.notify.addEventListener("characteristicvaluechanged", this.onNotify);
    await this.notify.startNotifications();
  }

  /**
   * Reassembles a frame split across notifications: a frame starts with
   * `7E 5A` and declares its length in bytes 2-3, which counts all but the
   * first four bytes.
   */
  private receive(chunk: Uint8Array) {
    let frame = chunk;
    if (this.partial && !(chunk[0] === 0x7e && chunk[1] === 0x5a)) {
      frame = new Uint8Array(this.partial.length + chunk.length);
      frame.set(this.partial);
      frame.set(chunk, this.partial.length);
    }
    this.partial = null;
    if (frame.length >= 4 && frame[0] === 0x7e && frame[1] === 0x5a) {
      const expected = (frame[2] | (frame[3] << 8)) + 4;
      if (frame.length < expected) {
        this.partial = frame;
        return;
      }
    }
    this.replies.push(frame);
  }

  private async write(bytes: Uint8Array) {
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
      if (offset > 0) await sleep(CHUNK_DELAY_MS);
      await this.writer.writeValueWithResponse(
        bytes.slice(offset, offset + CHUNK),
      );
    }
  }

  async command(cmd: number, param1 = 0, param2 = 0) {
    this.replies.clear();
    await this.write(btCommand(cmd, param1, param2));
    return this.replies.next(REPLY_TIMEOUT_MS, (reply) =>
      btReplyMatches(reply, cmd),
    );
  }

  async status() {
    const reply = await this.command(CMD.INQUIRY_STA);
    return reply ? parseBtStatus(reply) : null;
  }

  async loadedLabels() {
    const reply = await this.command(CMD.RETURN_MAT);
    return reply ? parseBtMaterial(reply) : null;
  }

  async sendBlock(block: Uint8Array) {
    const frames = btDataFrames(block);
    if (!(await this.command(CMD.NEXT_ZIPPEDBULK, BLOCK_SIZE, frames.length))) {
      throw new PrinterError("The printer stopped answering mid-label.");
    }
    for (const frame of frames) await this.write(frame);
  }

  async close() {
    this.notify.removeEventListener(
      "characteristicvaluechanged",
      this.onNotify,
    );
    if (this.device.gatt?.connected) this.device.gatt.disconnect();
  }
}
