import { cn } from "@/lib/utils";

/**
 * The legend that explains the asterisk `FieldLabel required` renders (#1070).
 *
 * One per form that has any required field, above its fields. An asterisk with
 * no legend is a convention the reader has to already know, and these forms are
 * filled in by people who have never seen this site before.
 *
 * Not `aria-hidden`: someone listening hears "required" on each field from the
 * label itself, but the sentence is also a reasonable thing to encounter once
 * at the top of a form, and hiding it would make the visible and spoken forms
 * of the page disagree.
 */
export function RequiredFieldsNote({ className }: { className?: string }) {
  return (
    <p className={cn("app-muted text-sm", className)}>
      <span aria-hidden="true" className="text-destructive">
        *
      </span>{" "}
      Required
    </p>
  );
}
