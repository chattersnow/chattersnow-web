"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteEventChecklistItemAction,
  listEventChecklistItemsAction,
  toggleEventChecklistItemAction,
  type EventChecklistItem,
} from "./checklist-actions";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { EmptyState } from "@/components/portal/empty-state";

export function ChecklistTab({
  eventId,
  mode,
  previewRows = LIST_PREVIEW_ROWS,
}: {
  eventId: string;
  mode: "view" | "edit";
  /** Rows before the rest move behind "View all"; `null` disables the cap. */
  previewRows?: number | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<EventChecklistItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  function load() {
    listEventChecklistItemsAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setItems(result.data);
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function refresh() {
    load();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("checklist", refresh);

  function withPending(id: string, run: () => Promise<void>) {
    setPendingIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await run();
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    });
  }

  function handleToggle(id: string, isDone: boolean) {
    withPending(id, async () => {
      await toggleEventChecklistItemAction(id, isDone);
    });
  }

  function handleDelete(id: string) {
    withPending(id, async () => {
      await deleteEventChecklistItemAction(id);
    });
  }

  const doneCount = items?.filter((item) => item.is_done).length ?? 0;

  const list = items ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((item) => item.title.toLowerCase().includes(needle));
  }, [list, query]);

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;

  function itemsList(rows: EventChecklistItem[]) {
    return (
      <ul className="flex flex-col divide-y divide-[var(--line)]">
        {rows.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <Checkbox
              checked={item.is_done}
              disabled={mode !== "edit" || pendingIds.has(item.id)}
              aria-label={`Mark "${item.title}" ${item.is_done ? "not done" : "done"}`}
              onCheckedChange={(checked) =>
                handleToggle(item.id, checked === true)
              }
            />
            <span
              className={cn(
                "flex-1 text-sm",
                item.is_done && "app-muted line-through",
              )}
            >
              {item.title}
            </span>
            {mode === "edit" && (
              <ConfirmDeleteButton
                label="Remove checklist item"
                title={`Remove "${item.title}"?`}
                description="This deletes the checklist item from this event. It can't be undone."
                confirmLabel="Remove"
                pending={pendingIds.has(item.id)}
                onConfirm={() => handleDelete(item.id)}
              />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {items === null ? (
        <TabLoadingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="No checklist items yet"
          description="Add the first one with + Add item above."
        />
      ) : (
        <div className="flex flex-col gap-1">
          <p className="app-muted text-xs">
            {doneCount} of {list.length} done
          </p>
          {itemsList(capped)}
          {hasOverflow && (
            <ListPreviewSheet
              title="Checklist"
              description={`${doneCount} of ${list.length} done`}
              triggerLabel={`View all ${list.length} checklist items`}
              searchPlaceholder="Search checklist items"
              searchLabel="Search checklist items"
              size="lg"
              query={query}
              onQueryChange={setQuery}
              totalCount={list.length}
              filteredCount={filtered.length}
            >
              {filtered.length === 0 ? (
                <EmptyState
                  title="No matching checklist items"
                  description="Clear or loosen the search to see more."
                />
              ) : (
                itemsList(filtered)
              )}
            </ListPreviewSheet>
          )}
        </div>
      )}
    </div>
  );
}
