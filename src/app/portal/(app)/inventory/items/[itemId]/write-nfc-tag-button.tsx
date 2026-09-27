"use client";

import { useRef, useState } from "react";
import { Nfc, X } from "lucide-react";
import { tagUrl } from "@/lib/inventory-tags";
import { useNfcSupported, writeNfcTag } from "@/components/portal/tag-scanner";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { recordNfcWrittenAction } from "../codes/actions";

/**
 * Writes an item's tag URL to an NFC sticker (#1420 part 3), from beside the
 * code in the item page's Tag card (#1444). Web NFC exists only in Chrome on Android, so the
 * button renders nowhere else. An iPhone writes the tag with a free app from
 * the copied tag URL instead, which the page's Tag card explains. The tag then
 * opens /portal/t/<code> on any phone, exactly as the printed QR label does.
 * A successful write is recorded against the code (#1450), so the Codes page
 * can say which tags have been written.
 *
 * The status line is a flex item that takes a whole row of its own at the end
 * of the row it sits in.
 */
export function WriteNfcTagButton({ code }: { code: string }) {
  const supported = useNfcSupported();
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">(
    "idle",
  );
  const abortRef = useRef<AbortController | null>(null);

  if (!supported) return null;

  async function write() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("waiting");
    try {
      // A tag has to carry an absolute URL, and this only runs in the browser.
      await writeNfcTag(
        tagUrl(window.location.origin, code),
        controller.signal,
      );
      setState("done");
      void recordNfcWrittenAction(code).catch(() => null);
    } catch {
      setState(controller.signal.aborted ? "idle" : "error");
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setState("idle");
  }

  return (
    <>
      {state === "waiting" ? (
        <TooltipIconButton label="Cancel writing the NFC tag" onClick={cancel}>
          <X />
        </TooltipIconButton>
      ) : (
        <TooltipIconButton
          label={`Write ${code} to an NFC tag`}
          onClick={write}
        >
          <Nfc />
        </TooltipIconButton>
      )}
      <p
        aria-live="polite"
        className="order-last basis-full text-sm empty:hidden"
      >
        {state === "waiting" && "Hold an NFC tag to the back of the phone."}
        {state === "done" && "Written. Tapping the tag now opens this item."}
        {state === "error" && (
          <span className="text-destructive">
            Could not write the tag. Check that NFC is on and the tag is not
            locked, then try again.
          </span>
        )}
      </p>
    </>
  );
}
