/**
 * The small pieces both dashboards share (#1079). Extracted from `page.tsx`
 * when the mobile dashboard arrived: a second copy of either would let the
 * two drift over wording nobody meant to change.
 */

export const meetingTypeLabels: Record<string, string> = {
  board: "Board meeting",
  committee: "Committee meeting",
  annual: "Annual meeting",
  other: "Meeting",
};

export function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
      {children}
    </h2>
  );
}
