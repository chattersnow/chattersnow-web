"use client";

import { Link2, Printer } from "lucide-react";
import { labelsHref } from "@/lib/inventory-labels";
import { tagUrl } from "@/lib/inventory-tags";
import type { InventoryCategory } from "@/lib/inventory";
import { CopyButton } from "@/components/copy-button";
import { IconLink } from "@/components/portal/icon-link";
import { ITEM_EXIT_STATUSES, type InventoryItem } from "../inventory-shared";
import {
  DistributeButton,
  type CurrentDistribution,
} from "./distribute-button";
import { EditInventorySheet } from "./edit-inventory-sheet";
import { GenerateCodeButton } from "./generate-code-button";
import {
  AssignNumberedCodeButton,
  UnassignNumberedCodeButton,
} from "./numbered-code-buttons";
import { WriteNfcTagButton } from "./write-nfc-tag-button";

/** What the Distribute action needs; null when the item can't go out. */
export type ItemDistribute = {
  current: CurrentDistribution | null;
  defaultEventId: string | null;
  eventOptions: { id: string; name: string }[];
};

/**
 * The item page's toolbar (#1441). Every control is an icon with a tooltip
 * naming it. Copy tag URL is the iPhone path: an iPhone can't write a tag from
 * the browser, so the URL is pasted into an app such as NFC Tools. Write NFC
 * tag renders only where Web NFC exists (Chrome on Android). Distribute
 * (#1443) is offered while the item can go out, and so is a reusable
 * numbered code (#1444): an item that has left can't take one.
 */
export function ItemActions({
  item,
  categories,
  canManage,
  distribute,
}: {
  item: InventoryItem;
  categories: InventoryCategory[];
  canManage: boolean;
  distribute: ItemDistribute | null;
}) {
  const code = item.assetTag ?? null;
  const numbered = item.numberedCode ?? null;
  const inStock = !ITEM_EXIT_STATUSES.includes(item.status);

  return (
    <>
      {distribute && <DistributeButton itemId={item.id} {...distribute} />}
      {canManage && !code && <GenerateCodeButton itemId={item.id} />}
      {canManage && inStock && (
        <AssignNumberedCodeButton itemId={item.id} current={numbered} />
      )}
      {canManage && numbered && (
        <UnassignNumberedCodeButton itemId={item.id} code={numbered} />
      )}
      {code && (
        <>
          <CopyButton
            label="Copy tag URL"
            icon={<Link2 />}
            getText={() => tagUrl(window.location.origin, code)}
          />
          <WriteNfcTagButton code={code} />
          <IconLink href={labelsHref([item.id])} label="Print label">
            <Printer />
          </IconLink>
        </>
      )}
      {canManage && <EditInventorySheet item={item} categories={categories} />}
    </>
  );
}
