import Link from "next/link";
import { Button } from "@/components/ui/button";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "agenda", label: "Agenda" },
  { value: "month", label: "Month" },
] as const;

export type CalendarView = (typeof VIEWS)[number]["value"];

export function ViewToggle({
  view,
  hrefFor,
}: {
  view: CalendarView;
  hrefFor: (view: CalendarView) => string;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-input p-1">
      {VIEWS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={view === option.value ? "default" : "ghost"}
          nativeButton={false}
          render={<Link href={hrefFor(option.value)} />}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
