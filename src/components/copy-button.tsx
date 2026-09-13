"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Copies text to the clipboard and says so for two seconds.
 *
 * The text arrives as a thunk rather than a string because every caller
 * composes it from a document that is already on screen -- an agenda, a
 * receipt -- and formatting it on every render to hand it to a button that may
 * never be pressed is work for nothing.
 *
 * Lifted out of the governance agenda export dialog when sale receipts (#1016)
 * wanted the same button.
 */
export function CopyButton({
  label,
  getText,
  variant = "secondary",
}: {
  label: string;
  getText: () => string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant={variant} onClick={handleCopy}>
      {copied ? "Copied!" : label}
    </Button>
  );
}
