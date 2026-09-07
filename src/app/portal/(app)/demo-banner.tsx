import { Info } from "lucide-react";

/**
 * Says out loud that this is the demo (#604).
 *
 * A visitor arrives here holding admin, sees donations, expenses and people,
 * and has no other way to tell that none of it describes anybody -- so the
 * banner is not decoration, it is the thing that keeps invented records from
 * being read as real ones. It sits between the sticky header and `<main>` so
 * it is present on every portal route rather than only the dashboard.
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-[var(--line)] bg-[var(--purple-soft)] px-6 py-2.5 text-sm text-[var(--purple-deep)] sm:px-10"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">This is the demo.</span> Every person,
        donation and record here is invented, and everything is rebuilt from
        scratch each night — change whatever you like.
      </p>
    </div>
  );
}
