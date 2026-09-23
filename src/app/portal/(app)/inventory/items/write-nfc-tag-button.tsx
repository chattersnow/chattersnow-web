"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Nfc } from "lucide-react";
import { tagUrl } from "@/lib/inventory-tags";
import { useNfcSupported, writeNfcTag } from "@/components/portal/tag-scanner";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";

/**
 * Writes an item's tag URL to an NFC sticker (#1420 part 3). Web NFC exists
 * only in Chrome on Android, so the button renders nowhere else; on an iPhone
 * the help text points at a free app instead. The tag then opens
 * /portal/t/<code> on any phone, exactly as the printed QR label does.
 */
const noSubscribe = () => () => {};

export function WriteNfcTagButton({ code }: { code: string }) {
  const supported = useNfcSupported();
  // A tag has to carry an absolute URL, and the origin is only known in the
  // browser.
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
  const url = tagUrl(origin, code);
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">(
    "idle",
  );
  const abortRef = useRef<AbortController | null>(null);

  if (!supported) {
    return (
      <FieldDescription>
        To put this code on an NFC tag, write the URL{" "}
        <span className="font-mono break-all">{url}</span> to it with a free app
        such as NFC Tools, or use Chrome on Android.
      </FieldDescription>
    );
  }

  async function write() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("waiting");
    try {
      await writeNfcTag(url, controller.signal);
      setState("done");
    } catch {
      setState(controller.signal.aborted ? "idle" : "error");
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setState("idle");
  }

  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={state === "waiting" ? cancel : write}
        >
          <Nfc /> {state === "waiting" ? "Cancel" : "Write NFC tag"}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm">
        {state === "waiting" && "Hold an NFC tag to the back of the phone."}
        {state === "done" && "Written. Tapping the tag now opens this item."}
        {state === "error" && (
          <span className="text-destructive">
            Could not write the tag. Check that NFC is on and the tag is not
            locked, then try again.
          </span>
        )}
      </p>
    </div>
  );
}
