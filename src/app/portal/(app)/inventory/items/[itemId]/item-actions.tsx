"use client";

import { Link2, Printer } from "lucide-react";
import { labelsHref } from "@/lib/inventory-labels";
import { tagUrl } from "@/lib/inventory-tags";
import type { InventoryCategory } from "@/lib/inventory";
import { CopyButton } from "@/components/copy-button";
import { IconLink } from "@/components/portal/icon-link";
import type { InventoryItem } from "../inventory-shared";
import { EditInventorySheet } from "./edit-inventory-sheet";
import { GenerateCodeButton } from "./generate-code-button";
import { WriteNfcTagButton } from "./write-nfc-tag-button";

/**
 * The item page's toolbar (#1441). Every control is an icon with a tooltip
 * naming it. Copy tag URL is the iPhone path: an iPhone can't write a tag from
 * the browser, so the URL is pasted into an app such as NFC Tools. Write NFC
 * tag renders only where Web NFC exists (Chrome on Android).
 */
export function ItemActions({
  item,
  categories,
  canManage,
}: {
  item: InventoryItem;
  categories: InventoryCategory[];
  canManage: boolean;
}) {
  const code = item.assetTag ?? null;

  return (
    <>
      {canManage && !code && <GenerateCodeButton itemId={item.id} />}
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
