import type { ReactNode } from "react";

export function ReadOnlyField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div data-slot="read-only-field" className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div id={htmlFor} className="text-sm break-words text-foreground">
        {children}
      </div>
    </div>
  );
}
