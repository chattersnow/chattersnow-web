"use client";

import type { InventoryCategory } from "@/lib/inventory";
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

/** What the Distribute action needs; null when the item can't go out. */
export type ItemDistribute = {
  current: CurrentDistribution | null;
  defaultEventId: string | null;
  eventOptions: { id: string; name: string }[];
};

/**
 * The item page's toolbar (#1441). Every control is an icon with a tooltip
 * naming it. Distribute (#1443) is offered while the item can go out, and so
 * is a reusable numbered code (#1444): an item that has left can't take one.
 * Copying, writing and printing a code sit beside that code in the Tag card,
 * since an item can have two.
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
      {canManage && <EditInventorySheet item={item} categories={categories} />}
    </>
  );
}
