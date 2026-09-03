import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkPendingPulse } from "@/components/link-pending";
import { SearchSubmitButton } from "@/components/search-submit-button";

/**
 * Search, in the toolbar, where it belongs.
 *
 * On every directory page this used to live inside the right-hand Filters
 * sheet, so finding one person was: click Filters, wait for the sheet, type,
 * click Filter, watch a full page navigation, and the sheet is gone. Search is
 * the primary action on a directory page and was three interactions deep
 * behind a control labelled with a secondary concept.
 *
 * Still a GET form -- the pages behind it filter server-side and the URL stays
 * shareable -- but its own form, so submitting search doesn't depend on the
 * sheet being open. `preserve` carries the sheet's other active filters
 * through as hidden inputs so searching narrows the current view instead of
 * resetting it.
 */
export function SearchField({
  action,
  defaultValue,
  placeholder,
  label = "Search",
  preserve = {},
}: {
  /** Route the form submits to, e.g. "/portal/people". */
  action: string;
  defaultValue: string;
  placeholder: string;
  label?: string;
  /** Other active filter params to carry through the submission. */
  preserve?: Record<string, string>;
}) {
  // "all" is every filter page's sentinel for "not filtering on this", so
  // carrying it forward would only add noise to the URL.
  const preserved = Object.entries(preserve).filter(
    ([, value]) => value !== "" && value !== "all",
  );
  const clearHref = preserved.length
    ? `${action}?${new URLSearchParams(preserved).toString()}`
    : action;

  return (
    <form method="get" action={action} className="flex items-center gap-2">
      {preserved.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="relative">
        <Search className="app-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          name="search"
          aria-label={label}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-56 pl-8 sm:w-72"
        />
      </div>
      <SearchSubmitButton />
      {defaultValue && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          nativeButton={false}
          render={<Link href={clearHref} />}
        >
          <LinkPendingPulse>
            <X />
          </LinkPendingPulse>
        </Button>
      )}
    </form>
  );
}
