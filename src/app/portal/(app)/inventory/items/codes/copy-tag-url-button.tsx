"use client";

import { Link2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { tagUrl } from "@/lib/inventory-tags";

/**
 * Copies one code's tag URL, the iPhone's way onto an NFC tag: paste it into
 * an app such as NFC Tools. A client component because the origin is the
 * browser's, and a server page can't hand CopyButton a function.
 */
export function CopyTagUrlButton({ code }: { code: string }) {
  return (
    <CopyButton
      label={`Copy tag URL for ${code}`}
      icon={<Link2 />}
      getText={() => tagUrl(window.location.origin, code)}
    />
  );
}
