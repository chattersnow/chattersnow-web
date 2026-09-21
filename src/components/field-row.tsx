import { cn } from "@/lib/utils";

/**
 * Two fields side by side in one form row.
 *
 * `<Field orientation="responsive">` was doing this job and is not shaped for
 * it. Its `@md` half is shadcn's *label beside control* layout
 * (`src/components/ui/field.tsx`), and two of the declarations it makes for
 * that purpose are wrong for a pair of stacked fields:
 *
 * - `items-center` centres the two columns against each other, so a left field
 *   carrying a `FieldDescription` pushes its neighbour's input downwards. On
 *   `/my/details` that put "Phone" below "The name you go by" and "Instagram"
 *   below "Pronouns".
 * - `*:w-auto` strips the children's `w-full` and puts no basis in its place,
 *   so each column is sized by its content rather than taking half the row.
 *   A `Select` with nothing chosen collapsed to its chevron.
 *
 * A row of equal columns is a grid, so this is one: `items-start` aligns the
 * labels rather than the boxes, and the tracks are equal whatever is in them.
 * `*:min-w-0` is the grid-specific half -- a grid item's automatic minimum is
 * its content, so a long unbroken value would otherwise widen its track and
 * push the row past the page.
 *
 * The breakpoint is `@md/field-group`, the same container query the Field
 * variants use, so a row folds to one column on the container's width rather
 * than the window's: these forms render in the public column, in portal
 * dialogs and in phone-height sheets, and only the container knows which.
 * That means a `FieldRow` belongs inside a `FieldGroup`, which is what
 * declares `@container/field-group`; outside one it simply stays stacked.
 *
 * Scoped to the constituent area for now -- `/my/details`. The same misuse is
 * in ~105 places across the portal and the
 * other public forms, and each one needs looking at rather than sedding,
 * because `responsive` genuinely is the right variant for the
 * label-beside-control rows mixed in among them.
 */
export function FieldRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-row"
      className={cn(
        "grid w-full items-start gap-4 *:min-w-0 @md/field-group:grid-cols-2",
        className,
      )}
      {...props}
    />
  );
}
