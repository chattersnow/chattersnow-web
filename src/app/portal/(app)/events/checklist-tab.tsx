"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteEventChecklistItemAction,
  listEventChecklistItemsAction,
  toggleEventChecklistItemAction,
  type EventChecklistItem,
} from "./checklist-actions";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

export function ChecklistTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [items, setItems] = useState<EventChecklistItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
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
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

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
        <p className="app-muted text-sm">No checklist items yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.length > 0 && (
            <p className="app-muted text-xs">
              {doneCount} of {items.length} done
            </p>
          )}
          <ul className="flex flex-col divide-y divide-[var(--line)]">
            {items.map((item) => (
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove checklist item"
                    disabled={pendingIds.has(item.id)}
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
