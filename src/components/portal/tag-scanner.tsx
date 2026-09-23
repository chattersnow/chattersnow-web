"use client";

import {
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Camera, CameraOff, Nfc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Scanning an inventory tag from inside the portal (#1420 part 3). Three ways
 * in, all handing the same raw string to `onScan`, which resolves it through
 * the one lookup in src/lib/inventory-tags.ts:
 *
 *   * a text input that stays focused, which is all a USB or Bluetooth
 *     keyboard-wedge scanner needs -- it types the code and presses Enter;
 *   * the camera, in the page: the browser's own BarcodeDetector where there
 *     is one (Chrome on Android and macOS), and @zxing/browser everywhere
 *     else, iOS Safari included -- loaded only when the camera is turned on;
 *   * Web NFC, which exists only in Chrome on Android. Everywhere else the
 *     control is hidden; an iPhone reads the tag natively instead and opens
 *     its URL, which the /portal/t resolver answers.
 */

// Neither API is in TypeScript's DOM lib yet.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};
type NdefRecord = {
  recordType: string;
  data?: DataView;
  encoding?: string;
};
type NdefReadingEvent = Event & {
  serialNumber: string;
  message: { records: NdefRecord[] };
};
type NdefReaderLike = EventTarget & {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: { records: { recordType: string; data: string }[] },
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  onreading: ((event: NdefReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
};
type NdefReaderCtor = new () => NdefReaderLike;

const BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

/** A camera keeps reading the same label while it is in frame. */
const REPEAT_WINDOW_MS = 2500;

function ndefReaderCtor(): NdefReaderCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader ?? null
  );
}

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector ?? null
  );
}

function isIos(): boolean {
  const { userAgent, platform, maxTouchPoints } = navigator;
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

const noSubscribe = () => () => {};

/** Read once on the client; `null` while server rendering. */
function useClientValue<T>(read: () => T): T | null {
  return useSyncExternalStore(noSubscribe, read, () => null);
}

/** Whether this browser can read and write NFC tags from a page. */
export function useNfcSupported(): boolean {
  return useClientValue(() => ndefReaderCtor() !== null) ?? false;
}

/** Writes `url` to the next NFC tag held to the phone (Chrome on Android). */
export async function writeNfcTag(
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  const Reader = ndefReaderCtor();
  if (!Reader) throw new Error("NFC_UNSUPPORTED");
  await new Reader().write(
    { records: [{ recordType: "url", data: url }] },
    { signal },
  );
}

type CameraState =
  "off" | "starting" | "on" | "denied" | "unavailable" | "error";

export function TagScanner({
  onScan,
  busy = false,
  idPrefix = "tag-scan",
}: {
  onScan: (scanned: string) => void;
  /** A lookup is in flight; shown beside the input. */
  busy?: boolean;
  idPrefix?: string;
}) {
  const [typed, setTyped] = useState("");
  const [camera, setCamera] = useState<CameraState>("off");
  const [nfcState, setNfcState] = useState<"off" | "on" | "error">("off");
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopCameraRef = useRef<(() => void) | null>(null);
  const stopNfcRef = useRef<AbortController | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const nfcSupported = useNfcSupported();
  const ios = useClientValue(isIos) ?? false;

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  function emit(value: string) {
    const scanned = value.trim();
    if (!scanned) return;
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.value === scanned && now - last.at < REPEAT_WINDOW_MS) {
      // Still in frame: keep suppressing until it has been out of view for
      // the whole window, rather than re-adding it every few seconds.
      last.at = now;
      return;
    }
    lastScanRef.current = { value: scanned, at: now };
    onScanRef.current(scanned);
  }

  useEffect(
    () => () => {
      stopCameraRef.current?.();
      stopNfcRef.current?.abort();
    },
    [],
  );

  // Not a <form>: the scanner sits inside the modal's own form, and a nested
  // form is invalid HTML. Enter -- which is how a wedge scanner ends a code --
  // is caught here so it adds the scan rather than submitting the modal.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitTyped();
  }

  function submitTyped() {
    // Typed or wedge input is deliberate: a repeat is not a camera re-read.
    lastScanRef.current = null;
    emit(typed);
    setTyped("");
    inputRef.current?.focus();
  }

  function stopCamera() {
    stopCameraRef.current?.();
    stopCameraRef.current = null;
    setCamera("off");
    inputRef.current?.focus();
  }

  async function startCamera() {
    const video = videoRef.current;
    if (!video) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    };

    try {
      const Detector = barcodeDetectorCtor();
      const supported = Detector?.getSupportedFormats
        ? await Detector.getSupportedFormats()
        : [];
      const formats = BARCODE_FORMATS.filter((format) =>
        supported.includes(format),
      );

      if (Detector && formats.includes("qr_code")) {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats });
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) emit(codes[0].rawValue);
          } catch {
            // A frame that could not be read; the next one may.
          }
          timer = setTimeout(tick, 250);
        };
        stopCameraRef.current = () => {
          stopped = true;
          clearTimeout(timer);
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        };
        void tick();
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 250,
          delayBetweenScanSuccess: 750,
        });
        const controls = await reader.decodeFromConstraints(
          constraints,
          video,
          (result) => {
            if (result) emit(result.getText());
          },
        );
        stopCameraRef.current = () => {
          controls.stop();
          video.srcObject = null;
        };
      }
      setCamera("on");
    } catch (error) {
      stopCameraRef.current?.();
      stopCameraRef.current = null;
      const name = error instanceof Error ? error.name : "";
      setCamera(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "unavailable"
            : "error",
      );
    }
  }

  async function startNfc() {
    const Reader = ndefReaderCtor();
    if (!Reader) return;
    const controller = new AbortController();
    stopNfcRef.current?.abort();
    stopNfcRef.current = controller;
    try {
      const reader = new Reader();
      reader.onreading = (event) => {
        const urlRecord = event.message.records.find(
          (record) => record.recordType === "url" && record.data,
        );
        const url = urlRecord?.data
          ? new TextDecoder(urlRecord.encoding ?? "utf-8").decode(
              urlRecord.data,
            )
          : null;
        // A tag we wrote carries the URL; a bare sticker only its serial.
        lastScanRef.current = null;
        emit(url ?? event.serialNumber);
      };
      await reader.scan({ signal: controller.signal });
      setNfcState("on");
    } catch {
      setNfcState("error");
    }
  }

  function stopNfc() {
    stopNfcRef.current?.abort();
    stopNfcRef.current = null;
    setNfcState("off");
  }

  const cameraActive = camera === "starting" || camera === "on";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor={`${idPrefix}-input`}>
            Scan or type a tag code
          </FieldLabel>
          <Input
            ref={inputRef}
            id={`${idPrefix}-input`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            // A keyboard-wedge scanner types into whatever has focus.
            autoFocus
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={submitTyped}
          disabled={!typed.trim()}
        >
          {busy ? <Spinner /> : null}
          Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={cameraActive ? stopCamera : startCamera}
          aria-pressed={cameraActive}
        >
          {cameraActive ? <CameraOff /> : <Camera />}
          {cameraActive ? "Stop camera" : "Use camera"}
        </Button>
        {nfcSupported && (
          <Button
            type="button"
            variant="secondary"
            onClick={nfcState === "on" ? stopNfc : startNfc}
            aria-pressed={nfcState === "on"}
          >
            <Nfc />
            {nfcState === "on" ? "Stop NFC" : "Tap NFC tag"}
          </Button>
        )}
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera preview"
        className={
          cameraActive
            ? "aspect-video w-full rounded-md bg-black object-cover"
            : "hidden"
        }
      />

      <div aria-live="polite" className="flex flex-col gap-1">
        {camera === "starting" && (
          <FieldDescription>
            <Spinner className="mr-1 inline" /> Starting the camera…
          </FieldDescription>
        )}
        {camera === "on" && (
          <FieldDescription>
            Hold a label&rsquo;s QR code or barcode in front of the camera.
          </FieldDescription>
        )}
        {camera === "denied" && (
          <FieldDescription className="text-destructive">
            Camera access was blocked. Allow it in the browser&rsquo;s site
            settings, or type the code instead.
          </FieldDescription>
        )}
        {camera === "unavailable" && (
          <FieldDescription className="text-destructive">
            No camera is available here. Type the code, or use a barcode
            scanner.
          </FieldDescription>
        )}
        {camera === "error" && (
          <FieldDescription className="text-destructive">
            The camera could not start. Try again, or type the code.
          </FieldDescription>
        )}
        {nfcState === "on" && (
          <FieldDescription>Hold an NFC tag to the phone.</FieldDescription>
        )}
        {nfcState === "error" && (
          <FieldDescription className="text-destructive">
            NFC could not start. Check that NFC is on, and that this site may
            use it.
          </FieldDescription>
        )}
        {ios && (
          <FieldDescription>
            On iPhone, tap an NFC tag to the top of the phone: it opens the item
            here, with an option to add it to this list.
          </FieldDescription>
        )}
      </div>
    </div>
  );
}
