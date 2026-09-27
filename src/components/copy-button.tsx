"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";

/**
 * Copies text to the clipboard and says so for two seconds.
 *
 * The text arrives as a thunk rather than a string because every caller
 * composes it from a document that is already on screen -- an agenda, a
 * receipt -- and formatting it on every render to hand it to a button that may
 * never be pressed is work for nothing.
 *
 * Lifted out of the governance agenda export dialog when sale receipts (#1016)
 * wanted the same button. Given an `icon`, it is an icon-only button in a
 * toolbar instead (#1441): the label becomes its tooltip, and the icon turns
 * into a check while "Copied" shows.
 */
export function CopyButton({
  label,
  getText,
  variant = "secondary",
  icon,
}: {
  label: string;
  getText: () => string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  icon?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (icon) {
    return (
      <>
        <TooltipIconButton
          label={copied ? "Copied" : label}
          onClick={handleCopy}
        >
          {copied ? <Check /> : icon}
        </TooltipIconButton>
        {/* The tooltip only shows on hover and focus, so a tap on a phone
            would otherwise say nothing. */}
        <span role="status" className="sr-only">
          {copied ? "Copied" : ""}
        </span>
      </>
    );
  }

  return (
    <Button type="button" variant={variant} onClick={handleCopy}>
      {copied ? "Copied!" : label}
    </Button>
  );
}
