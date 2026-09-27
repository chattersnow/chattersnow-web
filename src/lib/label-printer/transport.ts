import type { LoadedLabels, PrinterStatus } from "./protocol";

/**
 * One connected printer, over whichever link reached it (#1447). USB and
 * Bluetooth frame the same commands differently and put the answers at
 * different offsets; this is the surface the print flow needs from either.
 */
export interface Transport {
  readonly kind: "usb" | "bluetooth";
  /** Sends a command and returns its reply, or null when none came. */
  command(
    cmd: number,
    param1?: number,
    param2?: number,
  ): Promise<Uint8Array | null>;
  status(): Promise<PrinterStatus | null>;
  loadedLabels(): Promise<LoadedLabels | null>;
  /** Announces one compressed block and sends it. */
  sendBlock(block: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** A failure to show the person printing, in words they can act on. */
export class PrinterError extends Error {
  override name = "PrinterError";
}

/** The browser's device picker was dismissed: not an error to report. */
export class PrinterPickerCancelled extends Error {
  override name = "PrinterPickerCancelled";
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Replies as they arrive from the device, handed out one at a time to
 * whichever command is waiting.
 */
export class ReplyQueue {
  private replies: Uint8Array[] = [];
  private waiter: ((reply: Uint8Array) => void) | null = null;

  push(reply: Uint8Array) {
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter(reply);
    } else {
      this.replies.push(reply);
    }
  }

  /** Drops anything left over from an earlier command. */
  clear() {
    this.replies = [];
  }

  /** The next reply that satisfies `accept`, or null after `timeoutMs`. */
  async next(
    timeoutMs: number,
    accept: (reply: Uint8Array) => boolean = () => true,
  ): Promise<Uint8Array | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const queued = this.replies.shift();
      if (queued) {
        if (accept(queued)) return queued;
        continue;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const reply = await new Promise<Uint8Array | null>((resolve) => {
        const timer = setTimeout(() => {
          this.waiter = null;
          resolve(null);
        }, remaining);
        this.waiter = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
      });
      if (reply === null) return null;
      if (accept(reply)) return reply;
    }
  }
}
