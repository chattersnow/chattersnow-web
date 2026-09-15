"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useActionToast } from "@/components/portal/action-toast";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ViewerTime } from "@/components/viewer-time";

import { ArtworkCallStatusBadge } from "../submission-badges";
import type { ArtworkCall } from "../submission-types";
import { deleteArtworkCallAction } from "./actions";
import { ArtworkCallDialog } from "./call-dialog";
import { CallLinkPath, CopyCallLinkButton } from "./share-link";

function submissionCount(call: ArtworkCall): string {
  return call.submission_count === 1
    ? "1 submission"
    : `${call.submission_count} submissions`;
}

/** What deleting this call destroys, in the words the curator needs. */
function deleteDescription(call: ArtworkCall): string {
  const link = "Its link stops working, and this cannot be undone.";
  return call.submission_count === 0
    ? `Nothing has been submitted to “${call.title}” yet. ${link}`
    : `${submissionCount(call)} sent to “${call.title}” will be deleted with it, images included. ${link}`;
}

/**
 * The calls for artwork list.
 *
 * A table rather than a card per call (#1157): every call carries the same
 * half-dozen short values, which is a row list a curator scans and compares,
 * not parts of one view. Cards left two thirds of a desktop row empty and put
 * three calls over a screen.
 */
export function ArtworkCallsTable({
  calls,
  canManage,
}: {
  calls: ArtworkCall[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();

  const handleDelete = useCallback(
    (call: ArtworkCall) => {
      run(() => deleteArtworkCallAction(call.id), {
        success: `Deleted “${call.title}”.`,
        error: "Could not delete this call. Please try again.",
        onSuccess: () => router.refresh(),
      });
    },
    [run, router],
  );

  const columns = useMemo<PortalDataTableColumn<ArtworkCall>[]>(
    () => [
      {
        key: "title",
        label: "Call",
        sortValue: (call) => call.title,
        // Capped, like every other identity column in the portal: cells are
        // `whitespace-nowrap`, so an uncapped title widens the table until the
        // card scrolls sideways. Tighter on a phone, where 20rem of title is
        // the entire screen and pushes the row's own controls off it. The full
        // text stays in the cell's `title`.
        cellClassName: "max-w-[7rem] sm:max-w-xs",
        // The event is context rather than identity, so it sits under the
        // title and disappears when there isn't one, instead of a placeholder
        // standing in for it.
        render: (call) => (
          <div className="min-w-0">
            <div className="truncate font-medium" title={call.title}>
              {call.title}
            </div>
            {call.event && (
              <div className="app-muted truncate text-xs">
                For {call.event.name}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "status",
        // Sorted on the word the badge shows, so the order is the one the
        // reader can see rather than boolean false before true.
        label: "Status",
        sortValue: (call) => (call.is_open ? "Open" : "Closed"),
        render: (call) => <ArtworkCallStatusBadge isOpen={call.is_open} />,
      },
      {
        key: "closes_at",
        label: "Closes",
        // A full instant with its zone is the widest cell here by some way, so
        // on a phone it moves into the disclosure and the row keeps the call,
        // its status and its controls on screen instead of scrolling sideways
        // past them.
        hideBelow: "sm",
        // The ISO instant, not the rendered text: sorting on "Sep 9" against
        // "Sep 20" is alphabetical, and a call with no deadline sorts last
        // either way because the table puts blanks last.
        sortValue: (call) => call.closes_at,
        cellClassName: "app-muted",
        // The curator's own clock, named, like every other instant in the
        // portal (#1063). The artist still reads the call's own zone on the
        // public page, which is why the deadline says which zone it is in on
        // both sides rather than leaving either reader to guess.
        render: (call) => (
          <ViewerTime
            iso={call.closes_at}
            fallbackZone={call.timezone ?? call.event?.timezone ?? "UTC"}
          />
        ),
      },
      {
        key: "submissions",
        label: "Submissions",
        hideBelow: "md",
        sortValue: (call) => call.submission_count,
        cellClassName: "app-muted",
        render: (call) => call.submission_count,
      },
      // No column for max_images. It is a rule addressed to the artist, it is
      // on the public call page they read, and it is one field down in Edit
      // call -- and its header is wider than every value it would ever show,
      // which on a six-column table is width taken from the title.
      {
        key: "link",
        // Unsortable: the code is random, so ordering by it orders nothing.
        label: "Link",
        hideBelow: "lg",
        render: (call) => <CallLinkPath code={call.submission_code} />,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (call) => (
          <div className="flex items-center justify-end gap-1">
            {/* Copy sits here rather than beside the path, so the one thing
                this page exists for is still one tap away at the widths that
                drop the Link column. */}
            <CopyCallLinkButton
              code={call.submission_code}
              title={call.title}
            />
            {canManage && (
              <Tooltip>
                <ArtworkCallDialog
                  call={call}
                  events={[]}
                  trigger={
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${call.title}`}
                        />
                      }
                    >
                      <Pencil />
                    </TooltipTrigger>
                  }
                />
                <TooltipContent>Edit call</TooltipContent>
              </Tooltip>
            )}
            {canManage && (
              <ConfirmDeleteButton
                label={`Delete ${call.title}`}
                title={`Delete “${call.title}”?`}
                description={deleteDescription(call)}
                confirmLabel="Delete call"
                pending={isPending}
                onConfirm={() => handleDelete(call)}
              />
            )}
          </div>
        ),
      },
    ],
    [canManage, handleDelete, isPending],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={calls}
      getRowKey={(call) => call.id}
      emptyMessage="No calls for artwork."
    />
  );
}
