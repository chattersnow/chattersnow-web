import { expect } from "bun:test";
import type { ReactElement } from "react";
import { render, waitFor, within } from "@testing-library/react";
import { Toaster } from "@/components/ui/toast";

/**
 * The toast manager is module-level and Base UI mirrors every toast into an
 * off-screen live region, so a test can't just `getByText` a confirmation:
 * mount a viewport with the subject under test, and assert against the
 * visible stack only.
 */
/**
 * Each <Toaster /> mounts its own Base UI store, so toasts never leak between
 * tests even though the manager `toast.success` fires into is module-level.
 */
export function renderWithToaster(ui: ReactElement) {
  return render(
    <>
      {ui}
      <Toaster />
    </>,
  );
}

function toastStack() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="toast"]'),
  );
}

export function hasToast(text: string) {
  return toastStack().some((node) => within(node).queryByText(text) !== null);
}

export async function expectToast(text: string) {
  // Well past waitFor's 1s default: the toast arrives through a transition and
  // an entry animation, which a loaded full-suite run can push over a second.
  await waitFor(() => expect(hasToast(text)).toBe(true), { timeout: 5000 });
}
