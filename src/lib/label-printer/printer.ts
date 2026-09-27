/**
 * Printing labels on a Katasymbol / Supvan T50M Pro straight from the browser
 * (#1447). Loaded with `import()` when someone presses Print, so none of it
 * reaches a page that never prints.
 *
 * The print sequence and its timings are ported from supvan-cups
 * (`supvan-proto/src/printer.rs`, MIT, © 2026 Florian Hänel; see
 * THIRD_PARTY_LICENSE), which follows the vendor's own app.
 */

import { toPrintheadLines, type Bitmap } from "./bitmap";
import { splitIntoBuffers } from "./buffer";
import { compressBuffers, printSpeed } from "./compress";
import { CMD, type LoadedLabels, type PrinterStatus } from "./protocol";
import { PrinterError, sleep, type Transport } from "./transport";

export { connectBluetoothPrinter } from "./transport-ble";
export { connectUsbPrinter } from "./transport-hid";
export { PrinterError, PrinterPickerCancelled } from "./transport";
export type { Transport } from "./transport";

/** The speed for a label sent in more than one block: the vendor's value. */
const MULTI_BLOCK_SPEED = 20;
const POLL_MS = 100;
const BUFFER_POLL_MS = 20;
const BLOCK_SETTLE_MS = 100;

/** A label ready to send: its compressed blocks and the speed to print at. */
export type EncodedLabel = { blocks: Uint8Array[]; speed: number };

export function encodeLabel(bitmap: Bitmap): EncodedLabel {
  const { data, lines, bytesPerLine } = toPrintheadLines(bitmap);
  const { blocks, averageSize } = compressBuffers(
    splitIntoBuffers(data, lines, bytesPerLine),
  );
  // At full speed the head outruns the second block's transfer and stops
  // halfway down the label.
  return {
    blocks,
    speed: blocks.length > 1 ? MULTI_BLOCK_SPEED : printSpeed(averageSize),
  };
}

/** Whether the loaded stock is the size the labels were drawn for. */
export function labelsMatch(
  loaded: LoadedLabels | null,
  widthMm: number,
  heightMm: number,
): boolean {
  // An unreadable tag reports zeros; that is the status check's to explain.
  if (!loaded || (loaded.widthMm === 0 && loaded.heightMm === 0)) return true;
  return loaded.widthMm === widthMm && loaded.heightMm === heightMm;
}

async function poll(
  transport: Transport,
  attempts: number,
  intervalMs: number,
  done: (status: PrinterStatus) => boolean,
  failOnError = true,
): Promise<PrinterStatus> {
  for (let i = 0; i < attempts; i++) {
    const status = await transport.status();
    if (status) {
      if (failOnError && status.errors.length > 0) {
        throw new PrinterError(status.errors.join(" "));
      }
      if (done(status)) return status;
    }
    await sleep(intervalMs);
  }
  throw new PrinterError(
    "The printer stopped responding. Check it's on and try again.",
  );
}

/**
 * One label: wait for the printer to be idle, start a job, send each block
 * when there is room for it, and wait for the label to come out.
 */
async function printLabel(transport: Transport, label: EncodedLabel) {
  if (!(await transport.command(CMD.CHECK_DEVICE))) {
    throw new PrinterError(
      "The printer didn't answer. Check it's on and try again.",
    );
  }
  const ready = await poll(
    transport,
    60,
    POLL_MS,
    (status) => !status.busy && !status.printing,
    false,
  );
  if (ready.errors.length > 0) throw new PrinterError(ready.errors.join(" "));

  await transport.command(CMD.START_PRINT);
  await poll(transport, 60, POLL_MS, (status) => status.printing);

  for (const block of label.blocks) {
    // The firmware decompresses into one buffer; sending before it drains
    // garbles the label.
    await poll(transport, 200, BUFFER_POLL_MS, (status) => !status.bufferFull);
    await transport.sendBlock(block);
    await sleep(BLOCK_SETTLE_MS);
    await transport.command(CMD.BUF_FULL, block.length, label.speed);
    await sleep(BLOCK_SETTLE_MS);
  }

  // Idle alone isn't done: straight after the last block the printer may not
  // have started. The buffer has to have drained too.
  await poll(
    transport,
    300,
    POLL_MS,
    (status) => !status.printing && !status.busy && !status.bufferFull,
  );
}

/** Prints each label in turn, reporting how many are done. */
export async function printLabels(
  transport: Transport,
  labels: EncodedLabel[],
  onProgress: (printed: number) => void,
): Promise<void> {
  for (let i = 0; i < labels.length; i++) {
    try {
      await printLabel(transport, labels[i]);
    } catch (error) {
      await transport.command(CMD.STOP_PRINT).catch(() => null);
      throw error;
    }
    onProgress(i + 1);
  }
}
