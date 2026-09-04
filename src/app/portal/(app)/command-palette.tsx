"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { hasPermission, type PermissionMap } from "@/lib/auth/permissions";
import { visibleNavItems } from "@/lib/portal/nav";
import { searchPeopleAction } from "./command-palette-actions";

type PaletteItem = {
  value: string;
  label: string;
  detail: string | null;
  href: string;
};

type PaletteGroup = { value: string; items: PaletteItem[] };

/**
 * The portal has 55 routes across 14 sections and had no way to jump to one by
 * name, and no way to find a record without first knowing which section owns
 * it. For an operator who knows a donor's name but not whether they're filed
 * under People, Donors or Attendees, the only route was: guess a section, open
 * Filters, type, submit.
 *
 * Pages come from the shared nav tree, already permission-scoped, so the
 * palette can only ever offer somewhere the user can actually go. People are
 * fetched per keystroke and gated the same way the directory pages are.
 */
function pageItems(permissions: PermissionMap): PaletteItem[] {
  const items: PaletteItem[] = [];
  // One entry per destination. The nav tree cross-lists a page under more than
  // one section -- the volunteer directory is both People > Volunteers and
  // Volunteers > Directory -- and `value` is keyed by href, so without this the
  // list carries two options sharing an id and aria-activedescendant stops
  // tracking the highlight. The section listed first in the nav tree supplies
  // the entry; either label finds it, since the other section's label is the
  // `detail` this also matches on.
  const seen = new Set<string>();
  const push = (item: PaletteItem) => {
    if (seen.has(item.value)) return;
    seen.add(item.value);
    items.push(item);
  };
  for (const section of visibleNavItems(permissions)) {
    if (!section.subItems) {
      push({
        value: `page:${section.href}`,
        label: section.label,
        detail: null,
        href: section.href,
      });
      continue;
    }
    for (const sub of section.subItems) {
      push({
        value: `page:${sub.href}`,
        label: sub.label,
        // Two pairs of pages share a title -- Roles is both a volunteer and an
        // administration page, Donations both a finance and an inventory one
        // -- so the section is part of the entry, not decoration.
        detail: section.label,
        href: sub.href,
      });
    }
  }
  return items;
}

function matches(item: PaletteItem, query: string) {
  const needle = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(needle) ||
    (item.detail ?? "").toLowerCase().includes(needle)
  );
}

export function CommandPalette({
  permissions,
}: {
  permissions: PermissionMap;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [people, setPeople] = React.useState<PaletteItem[]>([]);
  const [isSearching, startSearch] = React.useTransition();

  const canSeePeople = hasPermission(permissions, "people", "view");
  const pages = React.useMemo(() => pageItems(permissions), [permissions]);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (!canSeePeople) return;

    // Each keystroke supersedes the one before it; the counter drops results
    // from a request the user has already typed past.
    const requestId = ++requestRef.current;
    if (next.trim().length < 2) {
      setPeople([]);
      return;
    }
    startSearch(async () => {
      const result = await searchPeopleAction(next);
      if (requestId !== requestRef.current || "error" in result) return;
      setPeople(
        result.people.map((person) => ({
          value: `person:${person.id}`,
          label: person.label,
          detail: person.detail,
          href: `/portal/people/${person.id}`,
        })),
      );
    });
  }

  const groups: PaletteGroup[] = React.useMemo(() => {
    const matchingPages = query.trim()
      ? pages.filter((page) => matches(page, query.trim()))
      : pages;
    const result: PaletteGroup[] = [];
    if (matchingPages.length > 0)
      result.push({ value: "Pages", items: matchingPages });
    if (people.length > 0) result.push({ value: "People", items: people });
    return result;
  }, [pages, people, query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setPeople([]);
    router.push(href);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setPeople([]);
        }
      }}
    >
      <Dialog.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Search the portal"
            className="size-10 rounded-full"
          />
        }
      >
        <Search />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden px-3 pt-20 pb-3">
          <Dialog.Popup
            aria-label="Search the portal"
            className="relative flex max-h-[min(32rem,calc(100dvh-6rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-card text-card-foreground shadow-xl transition-[translate,scale,opacity] duration-150 data-ending-style:-translate-y-3 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:-translate-y-3 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Autocomplete.Root
              open
              items={groups}
              value={query}
              onValueChange={handleQueryChange}
              filter={null}
              autoHighlight="always"
              keepHighlight
            >
              <Autocomplete.InputGroup className="flex cursor-text items-center gap-2 border-b border-[var(--line)] pl-3">
                <Search className="app-muted size-4 shrink-0" aria-hidden />
                <Autocomplete.Input
                  aria-label="Search pages and people"
                  placeholder={
                    canSeePeople
                      ? "Search pages and people..."
                      : "Search pages..."
                  }
                  className="h-11 w-full border-0 bg-transparent pr-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                {isSearching && <Spinner className="mr-3 shrink-0" />}
              </Autocomplete.InputGroup>
              <Dialog.Close className="sr-only">Close search</Dialog.Close>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                <Autocomplete.Empty>
                  <p className="app-muted px-3 py-6 text-sm">
                    Nothing matches “{query}”.
                  </p>
                </Autocomplete.Empty>

                <Autocomplete.List>
                  {(group: PaletteGroup) => (
                    <Autocomplete.Group
                      key={group.value}
                      items={group.items}
                      className="not-last:mb-1"
                    >
                      <Autocomplete.GroupLabel className="app-muted px-3 py-1.5 text-xs font-semibold tracking-[0.1em] uppercase select-none">
                        {group.value}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(item: PaletteItem) => (
                          <Autocomplete.Item
                            key={item.value}
                            value={item}
                            onClick={() => go(item.href)}
                            className="flex min-h-9 cursor-default items-center justify-between gap-3 px-3 text-sm outline-none select-none data-highlighted:bg-muted"
                          >
                            <span className="min-w-0 truncate">
                              {item.label}
                            </span>
                            {item.detail && (
                              <span className="app-muted shrink-0 text-xs">
                                {item.detail}
                              </span>
                            )}
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
