import type { ReactNode } from "react";

/**
 * The column every public page renders in.
 *
 * One width, deliberately not a prop (#1218). The site header and footer are
 * `mx-auto max-w-6xl` with the same `px-6 sm:px-10`
 * (`src/app/(public)/layout.tsx`), so a page that picks its own narrower
 * column is centred inside its own chrome and reads as inset -- which is what
 * `/brand` at `max-w-4xl` and the account area at `max-w-2xl`/`max-w-3xl` did.
 * Copy that needs a shorter measure caps the element, not the shell; see
 * `docs/public-page-widths.md`, and `legal-page-shell.tsx` for what fills the
 * space beside a reading column.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      // Focusable only as the skip link's target, so focus actually lands
      // in the content rather than staying on the link.
      tabIndex={-1}
      className="app-shell px-6 py-8 outline-none sm:px-10"
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}
