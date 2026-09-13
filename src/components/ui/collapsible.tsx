"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  );
}

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      // `collapsible-panel` (globals.css) is the height transition. It lives in
      // CSS rather than in a Tailwind utility because it reads Base UI's
      // `--collapsible-panel-height`: tw-animate-css ships
      // `animate-collapsible-down/up`, but those keyframes resolve Radix's
      // `--radix-collapsible-content-height` with an `auto` fallback, so on Base
      // UI they animate 0 -> auto and do nothing at all.
      className={cn("collapsible-panel", className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
