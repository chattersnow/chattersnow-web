"use client";

import { useRef, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The shared machinery behind both dialogs this folder owns -- the first-login
 * tour (welcome-dialog.tsx) and the release notes (whats-new-dialog.tsx).
 * Neither has any behavior of its own beyond the steps it supplies and what it
 * records on dismissal.
 *
 * A one-step dialog degrades correctly on its own: no dots, no Skip, just the
 * finish button.
 */
export type DialogStep = {
  key: string;
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

export function StepDialog({
  initialOpen,
  steps,
  finishLabel,
  srLabel,
  onDismiss,
}: {
  initialOpen: boolean;
  steps: DialogStep[];
  /** Label on the last step's primary button, e.g. "Get started". */
  finishLabel: string;
  /** Names the sequence for screen readers: "Step 2 of 4 of {srLabel}." */
  srLabel: string;
  /** Fired once, on whichever exit the user takes. */
  onDismiss: () => Promise<unknown>;
}) {
  // Seeded from the prop rather than driven by it: the layout doesn't remount
  // on navigation within the portal, so reading the prop directly would leave
  // the dialog reopening until the revalidation caught up. The layout keys
  // this component on the same flag, so a deliberate false -> true flip (the
  // "Show the tour again" button) still remounts and reopens it.
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(0);
  const [, startTransition] = useTransition();
  // Without this the dialog autofocuses the first tabbable control, which is
  // Skip -- so opening it and pressing Enter would dismiss it.
  const primaryRef = useRef<HTMLButtonElement>(null);

  const total = steps.length;
  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === total - 1;

  // Every exit -- the finish button, Skip, the X, Escape, the backdrop --
  // comes through here, so it's never recorded twice and never left unrecorded.
  // Closing is optimistic: nothing about dismissing this should wait on the
  // network.
  function handleOpenChange(next: boolean) {
    if (next) return;
    setOpen(false);
    startTransition(async () => {
      await onDismiss();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" initialFocus={primaryRef}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--purple-soft)] text-[var(--purple-deep)]"
            >
              <Icon className="size-5" />
            </span>
            <DialogTitle className="text-lg">{current.title}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Step {step + 1} of {total} of {srLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          {current.body}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          {total > 1 && (
            <div
              aria-hidden
              className="flex justify-center gap-1.5 sm:justify-start"
            >
              {steps.map((s, index) => (
                <span
                  key={s.key}
                  className={cn(
                    "size-2 rounded-full",
                    index === step ? "bg-[var(--purple)]" : "bg-[var(--line)]",
                  )}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2 sm:justify-end">
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            {!isLast && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Skip
              </Button>
            )}
            <Button
              type="button"
              ref={primaryRef}
              onClick={() =>
                isLast ? handleOpenChange(false) : setStep((s) => s + 1)
              }
            >
              {isLast ? finishLabel : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
