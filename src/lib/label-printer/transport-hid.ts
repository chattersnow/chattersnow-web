/**
 * The printer over USB, through WebHID (#1447): Chrome and Edge on the
 * desktop. Its framing and reply shapes are ported from supvan-cups
 * (`supvan-proto/src/usb_transport.rs`, MIT, © 2026 Florian Hänel; see
 * THIRD_PARTY_LICENSE).
 *
 * Every write is one 64-byte report with no report ID. A command's reply is
 * the next input report: eight bytes of status, or 64 for the loaded labels.
 */

import { CMD, parseUsbMaterial, parseUsbStatus, usbCommand } from "./protocol";
import {
  PrinterError,
  PrinterPickerCancelled,
  ReplyQueue,
  sleep,
  type Transport,
} from "./transport";

/** Supvan's USB vendor ID, shared by the whole T50/T80/G range. */
const SUPVAN_VENDOR_ID = 0x1820;
const REPORT_SIZE = 64;
const REPLY_TIMEOUT_MS = 2000;

export function webHidAvailable(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

export async function connectUsbPrinter(): Promise<Transport> {
  const [device] = await navigator.hid.requestDevice({
    filters: [{ vendorId: SUPVAN_VENDOR_ID }],
  });
  if (!device) throw new PrinterPickerCancelled();
  if (!device.opened) await device.open();
  return new HidTransport(device);
}

class HidTransport implements Transport {
  readonly kind = "usb";
  private replies = new ReplyQueue();
  private onReport = (event: HIDInputReportEvent) => {
    this.replies.push(
      new Uint8Array(
        event.data.buffer,
        event.data.byteOffset,
        event.data.byteLength,
      ),
    );
  };

  constructor(private device: HIDDevice) {
    device.addEventListener("inputreport", this.onReport);
  }

  private async write(bytes: Uint8Array) {
    const report = new Uint8Array(REPORT_SIZE);
    report.set(bytes.subarray(0, REPORT_SIZE));
    await this.device.sendReport(0, report);
  }

  async command(cmd: number, param1 = 0, param2?: number) {
    this.replies.clear();
    await this.write(usbCommand(cmd, param1, param2));
    return this.replies.next(REPLY_TIMEOUT_MS);
  }

  async status() {
    const reply = await this.command(CMD.INQUIRY_STA);
    return reply ? parseUsbStatus(reply) : null;
  }

  async loadedLabels() {
    const reply = await this.command(CMD.RETURN_MAT);
    return reply ? parseUsbMaterial(reply) : null;
  }

  async sendBlock(block: Uint8Array) {
    // Over USB the announcement carries the block's byte length.
    if (!(await this.command(CMD.NEXT_ZIPPEDBULK, block.length))) {
      throw new PrinterError("The printer stopped answering mid-label.");
    }
    for (let offset = 0; offset < block.length; offset += REPORT_SIZE) {
      await this.write(block.subarray(offset, offset + REPORT_SIZE));
      await sleep(1);
    }
  }

  async close() {
    this.device.removeEventListener("inputreport", this.onReport);
    if (this.device.opened) await this.device.close();
  }
}
