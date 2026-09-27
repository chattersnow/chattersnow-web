"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { createAssetTagsAction } from "../actions";

/**
 * Gives an item with no asset tag its code in place (#1441), so an item
 * received before tagging existed can be tagged from its own page rather than
 * by a trip through Print labels. The page re-renders with the new code.
 */
export function GenerateCodeButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await createAssetTagsAction([itemId]);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Tag code created.");
      router.refresh();
    });
  }

  return (
    <TooltipIconButton
      label="Generate code"
      onClick={generate}
      disabled={isPending}
    >
      {isPending ? <Spinner /> : <QrCode />}
    </TooltipIconButton>
  );
}
