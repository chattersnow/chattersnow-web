"use client";

import { Link2, Printer } from "lucide-react";
import { labelsHref, type LabelCodeKind } from "@/lib/inventory-labels";
import { tagUrl } from "@/lib/inventory-tags";
import { CopyButton } from "@/components/copy-button";
import { IconLink } from "@/components/portal/icon-link";
import { WriteNfcTagButton } from "./write-nfc-tag-button";

/**
 * What can be done with one of an item's codes, beside it in the Tag card
 * (#1444): either the numbered code or the tag code can be the item's QR
 * label and NFC tag. Copy tag URL is the iPhone path, since an iPhone can't
 * write a tag from the browser; Write NFC tag renders only where Web NFC
 * exists (Chrome on Android).
 */
export function CodeActions({
  itemId,
  code,
  kind,
}: {
  itemId: string;
  code: string;
  kind: LabelCodeKind;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 font-mono tracking-wider">{code}</span>
      <CopyButton
        label={`Copy tag URL for ${code}`}
        icon={<Link2 />}
        getText={() => tagUrl(window.location.origin, code)}
      />
      <WriteNfcTagButton code={code} />
      <IconLink
        href={labelsHref([itemId], kind)}
        label={`Print label for ${code}`}
      >
        <Printer />
      </IconLink>
    </div>
  );
}
