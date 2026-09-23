"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { TagScanner } from "@/components/portal/tag-scanner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  scanWarning,
  type DistributionDraft,
} from "@/lib/inventory-distribution-draft";
import {
  addToDistributionDraftAction,
  lookupScannedItemsAction,
  removeFromDistributionDraftAction,
  type ScannedItem,
} from "./distribution-draft-actions";

function itemLabel(item: { description: string; size: string | null }) {
  return item.size ? `${item.description} (${item.size})` : item.description;
}

/**
 * Scan mode of RecordDistributionModal (#1420 part 3): each scan adds one
 * piece to the person's server-side list for this event, so a tag opened in
 * another tab (an iPhone NFC tap) can add to the same list. A piece that
 * cannot go out -- already distributed, retired, not gear-library stock -- is
 * named and left off rather than added silently.
 */
export function ScannedDistributionList({
  eventId,
  draft,
  conflictItemId,
  onChanged,
}: {
  eventId: string | null;
  draft: DistributionDraft | null;
  /** The piece the last submit was refused over. */
  conflictItemId: string | null;
  /** Re-read the list from the server. */
  onChanged: () => Promise<void>;
}) {
  const [message, setMessage] = useState<{
    tone: "info" | "warning";
    text: string;
  } | null>(null);
  const [choices, setChoices] = useState<ScannedItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const items = draft?.items ?? [];

  function add(item: ScannedItem) {
    setChoices([]);
    const warning = scanWarning(item);
    if (warning) {
      setMessage({ tone: "warning", text: `${itemLabel(item)}: ${warning}` });
      return;
    }
    if (items.some((existing) => existing.id === item.id)) {
      setMessage({
        tone: "info",
        text: `${itemLabel(item)} is already listed.`,
      });
      return;
    }
    startTransition(async () => {
      const result = await addToDistributionDraftAction(item.id, eventId);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      setMessage({ tone: "info", text: `Added ${itemLabel(item)}.` });
      await onChanged();
    });
  }

  function handleScan(scanned: string) {
    setMessage(null);
    setChoices([]);
    startTransition(async () => {
      const result = await lookupScannedItemsAction(scanned);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      if (result.data.length === 0) {
        setMessage({
          tone: "warning",
          text: `No item has the tag “${scanned}”.`,
        });
        return;
      }
      if (result.data.length === 1) {
        add(result.data[0]);
        return;
      }
      // A manufacturer barcode shared by several pieces: ask which.
      setChoices(result.data);
    });
  }

  function remove(itemId: string) {
    startTransition(async () => {
      const result = await removeFromDistributionDraftAction(itemId, eventId);
      if ("error" in result) {
        setMessage({ tone: "warning", text: result.error });
        return;
      }
      await onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <TagScanner onScan={handleScan} busy={isPending} idPrefix="dist-scan" />

      <div aria-live="polite">
        {message && (
          <Alert
            variant={message.tone === "warning" ? "destructive" : "default"}
          >
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </div>

      {choices.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            That barcode is on {choices.length} items. Which one is this?
          </legend>
          {choices.map((item) => {
            const warning = scanWarning(item);
            return (
              <Button
                key={item.id}
                type="button"
                variant="secondary"
                className="h-auto justify-start py-2 text-left whitespace-normal"
                onClick={() => add(item)}
              >
                <span>
                  {itemLabel(item)}
                  {warning && (
                    <span className="app-muted block text-xs">{warning}</span>
                  )}
                </span>
              </Button>
            );
          })}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Scanned items ({items.length})</h3>
        {items.length === 0 ? (
          <p className="app-muted text-sm">
            Nothing scanned yet. Each scan adds one item.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
            {items.map((item) => {
              const warning =
                item.id === conflictItemId
                  ? "Already distributed."
                  : scanWarning(item);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{itemLabel(item)}</span>
                    {warning && (
                      <span className="block text-xs text-destructive">
                        {warning}
                      </span>
                    )}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${itemLabel(item)}`}
                          disabled={isPending}
                          onClick={() => remove(item.id)}
                        />
                      }
                    >
                      <X />
                    </TooltipTrigger>
                    <TooltipContent>{`Remove ${itemLabel(item)}`}</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
