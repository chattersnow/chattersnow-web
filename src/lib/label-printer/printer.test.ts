import { describe, expect, test } from "bun:test";
import { bitmapBytesPerRow } from "./bitmap";
import { encodeLabel, labelsMatch, printLabels } from "./printer";
import { CMD, type PrinterStatus } from "./protocol";
import type { Transport } from "./transport";

const idle: PrinterStatus = {
  bufferFull: false,
  printing: false,
  busy: false,
  errors: [],
};

/**
 * A printer that answers every command and walks through the states a real
 * one reports: idle, printing once started, idle again once the last block
 * has been taken.
 */
function fakePrinter(overrides: { errorsAfterStart?: string[] } = {}) {
  const log: string[] = [];
  let printing = false;
  let blocksLeft = 0;
  const transport: Transport = {
    kind: "usb",
    async command(cmd, param1 = 0, param2 = 0) {
      log.push(`${cmd.toString(16)}:${param1}:${param2}`);
      if (cmd === CMD.START_PRINT) printing = true;
      if (cmd === CMD.BUF_FULL && --blocksLeft === 0) printing = false;
      return new Uint8Array(8);
    },
    async status() {
      return {
        ...idle,
        printing,
        errors: printing ? (overrides.errorsAfterStart ?? []) : [],
      };
    },
    async loadedLabels() {
      return { widthMm: 50, heightMm: 30 };
    },
    async sendBlock(block) {
      log.push(`block:${block.length}`);
    },
    async close() {},
  };
  return {
    transport,
    log,
    expectBlocks(count: number) {
      blocksLeft = count;
    },
  };
}

function blankLabel() {
  return {
    width: 400,
    height: 240,
    data: new Uint8Array(bitmapBytesPerRow(400) * 240),
  };
}

describe("encodeLabel", () => {
  test("a blank 50 × 30 mm label fits one block at full speed", () => {
    const { blocks, speed } = encodeLabel(blankLabel());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].length).toBeLessThanOrEqual(4096);
    expect(speed).toBe(60);
  });
});

describe("printLabels", () => {
  test("checks, starts, sends each block, then announces it", async () => {
    const printer = fakePrinter();
    const label = encodeLabel(blankLabel());
    printer.expectBlocks(label.blocks.length);
    const progress: number[] = [];
    await printLabels(printer.transport, [label], (n) => progress.push(n));

    const commands = printer.log.filter((line) => !line.startsWith("11:"));
    expect(commands).toEqual([
      "12:0:0", // CHECK_DEVICE
      "13:0:0", // START_PRINT
      `block:${label.blocks[0].length}`,
      `10:${label.blocks[0].length}:60`, // BUF_FULL: length and speed
    ]);
    expect(progress).toEqual([1]);
  });

  test("stops the job and reports the printer's own error", async () => {
    const printer = fakePrinter({
      errorsAfterStart: ["The printer's cover is open."],
    });
    await expect(
      printLabels(printer.transport, [encodeLabel(blankLabel())], () => {}),
    ).rejects.toThrow("The printer's cover is open.");
    expect(printer.log.at(-1)).toBe("14:0:0"); // STOP_PRINT
  });
});

test("labelsMatch warns only about stock that reports a different size", () => {
  expect(labelsMatch({ widthMm: 50, heightMm: 30 }, 50, 30)).toBe(true);
  expect(labelsMatch({ widthMm: 40, heightMm: 30 }, 50, 30)).toBe(false);
  expect(labelsMatch({ widthMm: 0, heightMm: 0 }, 50, 30)).toBe(true);
  expect(labelsMatch(null, 50, 30)).toBe(true);
});
