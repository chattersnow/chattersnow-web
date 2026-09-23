"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { TagScanner } from "@/components/portal/tag-scanner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { findScannedItemsAction, type FoundItem } from "./scan-actions";

function itemHref(id: string) {
  return `/portal/inventory/items?item=${encodeURIComponent(id)}`;
}

/**
 * Scan a label, a manufacturer barcode or an NFC tag and open the item it
 * identifies (#1420 part 3). Reached from the items toolbar and from the
 * command palette, which drives `open` itself and renders no trigger. Recording
 * a handout by scanning is the distribution modal's scan mode, not this.
 */
export function ScanTagDialog({
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  withTrigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [message, setMessage] = useState<string | null>(null);
  const [choices, setChoices] = useState<FoundItem[]>([]);
  const [isPending, startTransition] = useTransition();

  function setOpen(next: boolean) {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setMessage(null);
      setChoices([]);
    }
  }

  function handleScan(scanned: string) {
    setMessage(null);
    setChoices([]);
    startTransition(async () => {
      const result = await findScannedItemsAction(scanned);
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      if (result.data.length === 0) {
        setMessage(`No item has the tag “${scanned}”.`);
        return;
      }
      if (result.data.length === 1) {
        setOpen(false);
        router.push(itemHref(result.data[0].id));
        return;
      }
      setChoices(result.data);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {withTrigger && (
        <DialogTrigger render={<Button type="button" variant="secondary" />}>
          <ScanLine /> Scan
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan a tag</DialogTitle>
          <DialogDescription>
            Scan an item&rsquo;s label or barcode, or type its code, to open it.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so closing stops the camera. */}
        {open && (
          <TagScanner
            onScan={handleScan}
            busy={isPending}
            idPrefix="find-scan"
          />
        )}
        <div aria-live="polite">
          {message && (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </div>
        {choices.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              That barcode is on {choices.length} items.
            </p>
            <ul className="flex flex-col gap-1">
              {choices.map((item) => (
                <li key={item.id}>
                  <Link
                    href={itemHref(item.id)}
                    onClick={() => setOpen(false)}
                    className="text-sm underline underline-offset-4"
                  >
                    {item.description}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
