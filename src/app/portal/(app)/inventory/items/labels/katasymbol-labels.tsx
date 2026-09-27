"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, Download, Usb } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Bitmap } from "@/lib/label-printer/bitmap";
import {
  KATASYMBOL_LABEL_MM,
  canvasToPng,
  renderLabel,
  type RasterLabel,
} from "@/lib/label-printer/raster";
import { storedZip } from "@/lib/label-printer/zip";
import { recordLabelsPrintedAction } from "./actions";

type Rendered = { bitmap: Bitmap; png: Blob; url: string };
type Link = "usb" | "bluetooth";
type Driver = typeof import("@/lib/label-printer/printer");
type Connected = Awaited<ReturnType<Driver["connectUsbPrinter"]>>;

type PrintState =
  | { step: "idle" }
  | { step: "connecting" }
  | { step: "printing"; printed: number; total: number }
  | { step: "done"; total: number }
  | { step: "mismatch"; loaded: string; transport: Connected }
  | { step: "error"; message: string };

const loadDriver = () => import("@/lib/label-printer/printer");

const subscribeNever = () => () => {};
function useBrowserSupport() {
  const usb = useSyncExternalStore(
    subscribeNever,
    () => "hid" in navigator,
    () => false,
  );
  const bluetooth = useSyncExternalStore(
    subscribeNever,
    () => "bluetooth" in navigator,
    () => false,
  );
  // A phone's share sheet reaches Photos and Files, and from there the
  // Katasymbol app; on a desktop a download is what people expect.
  const share = useSyncExternalStore(
    subscribeNever,
    () =>
      typeof navigator.canShare === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
  return { usb, bluetooth, share };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One file name per label, unique even when two share a code. */
function fileNames(labels: RasterLabel[]): string[] {
  const seen = new Map<string, number>();
  return labels.map(({ code }) => {
    const count = (seen.get(code) ?? 0) + 1;
    seen.set(code, count);
    return count === 1 ? `${code}.png` : `${code}-${count}.png`;
  });
}

/**
 * The Katasymbol T50M Pro layout (#1447): each label drawn at the printer's
 * own resolution, previewed as exactly those dots, and then either sent to
 * the printer over USB or Bluetooth or saved as images for the Katasymbol app.
 *
 * The printer has no driver for the browser's print dialog, so the direct
 * path talks to it through WebHID or Web Bluetooth (Chrome and Edge; Chrome
 * on Android; Bluefy on an iPhone). The images work in every browser.
 */
export function KatasymbolLabels({
  labels,
  tagIds,
}: {
  labels: RasterLabel[];
  /** Recorded as printed once the labels print or their images are saved
   *  (#1450). */
  tagIds: readonly string[];
}) {
  const support = useBrowserSupport();
  const [rendered, setRendered] = useState<Rendered[] | null>(null);
  const [state, setState] = useState<PrintState>({ step: "idle" });
  const [saving, setSaving] = useState(false);
  // The device picker must open while the click still counts as a user
  // gesture, so the driver is fetched ahead of it.
  const driver = useRef<Promise<Driver> | null>(null);

  useEffect(() => {
    if (support.usb || support.bluetooth) driver.current ??= loadDriver();
  }, [support.usb, support.bluetooth]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const next: Rendered[] = [];
      for (const label of labels) {
        const { bitmap, canvas } = await renderLabel(label);
        const png = await canvasToPng(canvas);
        const url = URL.createObjectURL(png);
        urls.push(url);
        next.push({ bitmap, png, url });
      }
      if (!cancelled) setRendered(next);
    })().catch(() => {
      if (!cancelled) {
        setState({
          step: "error",
          message: "These labels couldn't be drawn. Reload the page to retry.",
        });
      }
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [labels]);

  async function send(transport: Connected) {
    const { encodeLabel, printLabels } = await (driver.current ??=
      loadDriver());
    const encoded = rendered!.map(({ bitmap }) => encodeLabel(bitmap));
    setState({ step: "printing", printed: 0, total: encoded.length });
    try {
      await printLabels(transport, encoded, (printed) =>
        setState({ step: "printing", printed, total: encoded.length }),
      );
      setState({ step: "done", total: encoded.length });
      void recordLabelsPrintedAction(tagIds).catch(() => null);
    } catch (error) {
      setState({ step: "error", message: describe(error) });
    } finally {
      await transport.close().catch(() => null);
    }
  }

  async function print(link: Link) {
    setState({ step: "connecting" });
    let transport: Connected | null = null;
    try {
      const printer = await (driver.current ??= loadDriver());
      transport = await (link === "usb"
        ? printer.connectUsbPrinter()
        : printer.connectBluetoothPrinter());
      const loaded = await transport.loadedLabels();
      const { width, height } = KATASYMBOL_LABEL_MM;
      if (!printer.labelsMatch(loaded, width, height)) {
        setState({
          step: "mismatch",
          loaded: `${loaded!.widthMm} × ${loaded!.heightMm} mm`,
          transport,
        });
        return;
      }
    } catch (error) {
      await transport?.close().catch(() => null);
      if (error instanceof Error && error.name === "PrinterPickerCancelled") {
        setState({ step: "idle" });
      } else {
        setState({ step: "error", message: describe(error) });
      }
      return;
    }
    await send(transport);
  }

  async function saveImages() {
    if (!rendered) return;
    setSaving(true);
    try {
      const names = fileNames(labels);
      const files = rendered.map(
        ({ png }, i) => new File([png], names[i], { type: "image/png" }),
      );
      // Saved images count as printed (#1450); a closed share sheet doesn't.
      let saved = true;
      if (support.share && navigator.canShare({ files })) {
        saved = await navigator.share({ files }).then(
          () => true,
          (error: unknown) => {
            // Closing the share sheet is not a failure, nor a print.
            if (error instanceof DOMException && error.name === "AbortError") {
              return false;
            }
            throw error;
          },
        );
      } else if (files.length === 1) {
        download(files[0], names[0]);
      } else {
        const entries = await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            data: new Uint8Array(await file.arrayBuffer()),
          })),
        );
        const zip = storedZip(entries);
        download(
          new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }),
          "labels.zip",
        );
      }
      if (saved) void recordLabelsPrintedAction(tagIds).catch(() => null);
    } finally {
      setSaving(false);
    }
  }

  const busy =
    !rendered || state.step === "connecting" || state.step === "printing";
  const direct = support.usb || support.bluetooth;

  return (
    <div className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {support.usb && (
          <Button type="button" disabled={busy} onClick={() => print("usb")}>
            <Usb /> Print over USB
          </Button>
        )}
        {support.bluetooth && (
          <Button
            type="button"
            variant={support.usb ? "outline" : "default"}
            disabled={busy}
            onClick={() => print("bluetooth")}
          >
            <Bluetooth /> Print over Bluetooth
          </Button>
        )}
        <Button
          type="button"
          variant={direct ? "outline" : "default"}
          disabled={!rendered || saving}
          onClick={saveImages}
        >
          {saving ? <Spinner /> : <Download />} Save label{" "}
          {labels.length === 1 ? "image" : "images"}
        </Button>
        <p role="status" className="app-muted text-sm">
          {state.step === "connecting" && "Connecting to the printer…"}
          {state.step === "printing" &&
            `Printing ${Math.min(state.printed + 1, state.total)} of ${state.total}…`}
          {state.step === "done" &&
            `Printed ${state.total} label${state.total === 1 ? "" : "s"}.`}
        </p>
      </div>

      {!direct && (
        <p className="app-muted text-sm">
          Direct printing needs Chrome or Edge (or Bluefy on iPhone). Otherwise,
          save the images and print them from the Katasymbol app.
        </p>
      )}

      {state.step === "mismatch" && (
        <Alert>
          <AlertTitle>The printer has {state.loaded} labels loaded</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              These labels are drawn for 50 × 30 mm. Load that stock, or print
              anyway.
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => send(state.transport)}
              >
                Print anyway
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void state.transport.close().catch(() => null);
                  setState({ step: "idle" });
                }}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {state.step === "error" && (
        <Alert variant="destructive">
          <AlertTitle>The labels didn’t print</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {/* Black on white in both themes, like the sheets: this is the label. */}
      <div className="flex flex-wrap gap-4">
        {labels.map((label, i) => (
          <div
            key={`${label.code}-${i}`}
            className="flex items-center justify-center overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-black/10"
            style={{
              width: `${KATASYMBOL_LABEL_MM.width}mm`,
              height: `${KATASYMBOL_LABEL_MM.height}mm`,
            }}
          >
            {/* A blob: URL drawn in the browser; nothing for next/image
                to optimize. */}
            {rendered?.[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rendered[i].url}
                alt={`Label ${label.code}`}
                className="size-full [image-rendering:pixelated]"
              />
            ) : (
              <Spinner className="text-black/40" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function describe(error: unknown): string {
  if (error instanceof Error && error.name === "PrinterError") {
    return error.message;
  }
  if (error instanceof DOMException && error.name === "SecurityError") {
    return "The browser blocked access to the printer. Try again from this page.";
  }
  const detail = error instanceof Error ? ` (${error.message})` : "";
  return `Couldn’t reach the printer. Check it’s on and connected, then try again.${detail}`;
}
