"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandHeart } from "lucide-react";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { addToDistributionDraftAction } from "../../../home/distribution-draft-actions";
import { RecordDistributionModal } from "../../../home/record-distribution-modal";

/** The distribution in progress that this item would join. */
export type CurrentDistribution = {
  eventId: string | null;
  itemCount: number;
  recipientName: string | null;
  /** This item is already on it. */
  includesItem: boolean;
};

export function distributeLabel(current: CurrentDistribution | null): string {
  if (!current) return "Distribute";
  const items =
    current.itemCount === 1 ? "1 item" : `${current.itemCount} items`;
  const detail = current.recipientName
    ? `${items}, for ${current.recipientName}`
    : items;
  return current.includesItem
    ? `Open current distribution (${detail})`
    : `Add to current distribution (${detail})`;
}

/**
 * Distribute from the item page (#1443). Puts the item on the person's
 * distribution list -- the one already in progress if there is one, otherwise
 * a new one at the active event -- and opens RecordDistributionModal in scan
 * mode on that list, where the recipient is picked and more gear is added.
 */
export function DistributeButton({
  itemId,
  current,
  defaultEventId,
  eventOptions,
}: {
  itemId: string;
  current: CurrentDistribution | null;
  /** The active event, used when no distribution is in progress. */
  defaultEventId: string | null;
  eventOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const eventId = current ? current.eventId : defaultEventId;
  const label = distributeLabel(current);

  function start() {
    if (current?.includesItem) {
      setOpen(true);
      return;
    }
    startTransition(async () => {
      const result = await addToDistributionDraftAction(itemId, eventId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(true);
    });
  }

  return (
    <>
      <TooltipIconButton label={label} onClick={start} disabled={isPending}>
        {isPending ? <Spinner /> : <HandHeart />}
      </TooltipIconButton>
      <RecordDistributionModal
        // Keyed so a list moved to another event reopens on the new default.
        key={eventId ?? "none"}
        withTrigger={false}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          // The list may have grown, or moved to another event.
          if (!nextOpen) router.refresh();
        }}
        eventId={eventId ?? undefined}
        eventOptions={eventOptions}
        showRecipientField
      />
    </>
  );
}
