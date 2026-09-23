"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { RegistrationStep } from "./registration-step";

type Validatable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The first control under `root` that would block a submission, if any. */
function firstInvalid(root: HTMLElement | null): Validatable | null {
  if (!root) return null;
  const controls = root.querySelectorAll<Validatable>(
    "input, select, textarea",
  );
  for (const control of controls) {
    if (control.willValidate && !control.checkValidity()) return control;
  }
  return null;
}

/**
 * The frame both registration forms share (#1403): the questions under
 * "About you", the notices and the agreement under "Before you go", and the
 * button pinned beneath them.
 *
 * **Two steps on a phone, one page elsewhere.** Ten fields, two notices and an
 * agreement on one narrow screen is a long way to scroll to a button, and
 * forms that long do better split in two on mobile. Wider screens have the
 * room, so they get the same two groups under their legends and no stepping.
 * Which of the two is happening is decided by CSS alone (`max-sm:hidden`),
 * so the server render and the first paint agree and nothing flickers; the
 * handlers read it back from the layout rather than keeping a second copy of
 * the breakpoint in JavaScript.
 *
 * **No URL per step**, for #1256's reason: "I am halfway through a form" is
 * not worth a history entry, and Back belongs to the page. The hidden step is
 * hidden rather than unmounted, and the values live in the form's own state
 * either way, so going back and forth keeps everything typed.
 *
 * **Validation is done here, not by the browser** (`noValidate`). The browser
 * would refuse to submit over a required field on the hidden step and could
 * not show it, which is a button that silently does nothing. So "Next" checks
 * the first step's fields, submitting checks all of them, and an invalid one
 * brings its own step back into view before the browser's message is shown.
 * A server error does the same through `error.step`.
 *
 * **The pinned bar (#1404).** #1375 pinned the bare button, which left it
 * floating over the fields as they scrolled past, with their text showing
 * around it. It is a bar now: opaque, full width, with a rule above it, so
 * what scrolls beneath is covered rather than half-visible. It is the last
 * child of the tall `FieldGroup`, which is what it travels within, so at full
 * scroll it settles into place below the last field and never covers one for
 * good. The fields carry a bottom scroll margin of the bar's height, so a
 * field that focus or a validation message scrolls into view lands above the
 * bar rather than beneath it.
 */
export function RegistrationSteps({
  details,
  confirm,
  error,
  isPending,
  onSubmit,
  submitVariant = "default",
}: {
  /** "About you": the questions about the registrant and their party. */
  details: ReactNode;
  /**
   * "Before you go": the notices and the agreement. Null when there are none,
   * which leaves one step and nothing to go on to -- a heading over an empty
   * step would be a step for its own sake.
   */
  confirm: ReactNode;
  /** The last server error, placed on the step that owns it. */
  error: { message: string; step: RegistrationStep } | null;
  isPending: boolean;
  /** Called once every field on both steps is valid. */
  onSubmit: () => void;
  submitVariant?: "default" | "rainbow";
}) {
  const [step, setStep] = useState<RegistrationStep>("details");
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLFieldSetElement>(null);
  const confirmRef = useRef<HTMLFieldSetElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const hasConfirm = confirm !== null;

  // A new server error moves the reader to its step, during render rather than
  // in an effect, so the scroll below finds the alert already on screen.
  const [shownError, setShownError] = useState(error);
  if (error !== shownError) {
    setShownError(error);
    if (error) setStep(hasConfirm ? error.step : "details");
  }

  useEffect(() => {
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [shownError]);

  /** True when the steps are being shown one at a time: a phone. */
  function isStepped() {
    const hidden = step === "details" ? confirmRef.current : detailsRef.current;
    return hidden !== null && getComputedStyle(hidden).display === "none";
  }

  /** Shows `next` and hands it focus, so a screen reader hears its legend. */
  function goTo(next: RegistrationStep) {
    flushSync(() => setStep(next));
    const target = next === "details" ? detailsRef.current : confirmRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  }

  function handleNext() {
    const invalid = firstInvalid(detailsRef.current);
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    goTo("confirm");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Enter in a first-step field on a phone: the button it would press is on
    // the next step, so it means "Next".
    if (hasConfirm && step === "details" && isStepped()) {
      handleNext();
      return;
    }

    const invalid = firstInvalid(formRef.current);
    if (invalid) {
      const owner = detailsRef.current?.contains(invalid)
        ? "details"
        : "confirm";
      if (owner !== step) flushSync(() => setStep(owner));
      invalid.reportValidity();
      return;
    }

    onSubmit();
  }

  const errorAlert = (owner: RegistrationStep) =>
    error &&
    (hasConfirm ? error.step : "details") === owner && (
      <div ref={errorRef} className="scroll-my-24">
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );

  const showingDetails = !hasConfirm || step === "details";

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      // The bar's height, give or take, so nothing focus or a validation
      // message scrolls to lands underneath it (#1404).
      className="[&_input]:scroll-mb-24 [&_textarea]:scroll-mb-24 [&_button]:scroll-mb-24"
    >
      <FieldGroup>
        <FieldSet
          ref={detailsRef}
          tabIndex={-1}
          className={cn(
            "scroll-mt-24 outline-none",
            !showingDetails && "max-sm:hidden",
          )}
        >
          {hasConfirm && (
            <FieldLegend>
              <span className="app-muted block text-xs font-normal sm:hidden">
                Step 1 of 2
              </span>
              About you
            </FieldLegend>
          )}
          {errorAlert("details")}
          <FieldGroup>{details}</FieldGroup>
        </FieldSet>

        {hasConfirm && (
          <FieldSet
            ref={confirmRef}
            tabIndex={-1}
            className={cn(
              "scroll-mt-24 outline-none",
              step === "details" && "max-sm:hidden",
            )}
          >
            <FieldLegend>
              <span className="app-muted block text-xs font-normal sm:hidden">
                Step 2 of 2
              </span>
              Before you go
            </FieldLegend>
            {errorAlert("confirm")}
            <FieldGroup>{confirm}</FieldGroup>
          </FieldSet>
        )}

        {/* The last child of the outer `FieldGroup`, which is its containing
            block and what it travels within -- see the comment above. `-mx-4
            px-4` carries the backdrop out to the sheet's edges, whose scroll
            column has that padding, and into the page's gutter, so text
            does not show at either side of it. The `env()` resolves to 0
            until a layout exports `viewport-fit=cover`. */}
        <div className="bg-background sticky bottom-0 z-10 -mx-4 flex gap-3 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {hasConfirm && step === "confirm" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => goTo("details")}
              disabled={isPending}
              className="sm:hidden"
            >
              Back
            </Button>
          )}
          {hasConfirm && step === "details" && (
            <Button
              type="button"
              variant={submitVariant}
              onClick={handleNext}
              className="flex-1 sm:hidden"
            >
              Next
            </Button>
          )}
          {/* Not "Register": that is the disclosure's trigger above the form
              (#1256), and two buttons of the same name in one section are one
              for the reader to disambiguate and one for a test to pick the
              wrong one of. Rendered on the first step too, hidden on a phone,
              so a wider screen always has it. */}
          <Button
            type="submit"
            variant={submitVariant}
            disabled={isPending}
            className={cn(
              "flex-1 sm:flex-none",
              hasConfirm && step === "details" && "max-sm:hidden",
            )}
          >
            {isPending ? "Registering…" : "Complete registration"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
