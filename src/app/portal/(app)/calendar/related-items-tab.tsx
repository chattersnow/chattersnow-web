"use client";

import { useEffect, useState, useTransition } from "react";
import { Link2, X } from "lucide-react";
import {
  linkCalendarItemsAction,
  listRelatedCalendarItemCandidatesAction,
  unlinkCalendarItemsAction,
  type RelatedCalendarItemSummary,
  type SuggestedRelatedCalendarItem,
} from "./related-items-actions";
import { CATEGORIES, ITEM_TYPES, labelFor } from "./calendar-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export function RelatedItemsTab({
  itemId,
  canManage,
  open,
}: {
  itemId: string;
  canManage: boolean;
  open: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState<RelatedCalendarItemSummary[]>([]);
  const [suggested, setSuggested] = useState<SuggestedRelatedCalendarItem[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listRelatedCalendarItemCandidatesAction(itemId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
      } else {
        setError(null);
        setConfirmed(result.data.confirmed);
        setSuggested(result.data.suggested);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, itemId]);

  function handleLink(candidate: SuggestedRelatedCalendarItem) {
    startTransition(async () => {
      const result = await linkCalendarItemsAction(itemId, candidate.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuggested((prev) => prev.filter((row) => row.id !== candidate.id));
      setConfirmed((prev) => [
        ...prev,
        {
          id: candidate.id,
          title: candidate.title,
          item_type: candidate.item_type,
          starts_at: candidate.starts_at,
        },
      ]);
    });
  }

  function handleUnlink(related: RelatedCalendarItemSummary) {
    startTransition(async () => {
      const result = await unlinkCalendarItemsAction(itemId, related.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setConfirmed((prev) => prev.filter((row) => row.id !== related.id));
    });
  }

  if (loading) {
    return <p className="app-muted text-sm">Loading related items...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Confirmed</h3>
        {confirmed.length === 0 ? (
          <p className="app-muted text-sm">No related items linked yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {confirmed.map((related) => (
              <li
                key={related.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{related.title}</span>
                  <span className="app-muted text-xs">
                    {labelFor(ITEM_TYPES, related.item_type)} ·{" "}
                    {dateFormatter.format(new Date(related.starts_at))}
                  </span>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove link to ${related.title}`}
                    disabled={isPending}
                    onClick={() => handleUnlink(related)}
                  >
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Suggested</h3>
          {suggested.length === 0 ? (
            <p className="app-muted text-sm">
              No related-item suggestions right now.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {suggested.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {candidate.title}
                    </span>
                    <span className="app-muted text-xs">
                      {labelFor(ITEM_TYPES, candidate.item_type)} ·{" "}
                      {dateFormatter.format(new Date(candidate.starts_at))}
                    </span>
                    {(candidate.shared_categories.length > 0 ||
                      candidate.shared_programs.length > 0) && (
                      <span className="app-muted text-xs">
                        Shares:{" "}
                        {[
                          ...candidate.shared_categories.map((category) =>
                            labelFor(CATEGORIES, category),
                          ),
                          ...candidate.shared_programs,
                        ].join(", ")}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleLink(candidate)}
                  >
                    <Link2 />
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
