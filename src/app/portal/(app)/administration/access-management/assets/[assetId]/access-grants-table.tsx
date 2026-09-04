"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteAccessGrantAction,
  verifyAccessGrantAction,
} from "../../actions";
import { humanize } from "../../labels";
import type { AccessGrantRow } from "@/lib/portal/access-management/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AccessGrantDetailsSheet } from "./access-grant-details-sheet";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";

const STATUS_BADGE_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  active: "secondary",
  revoked: "destructive",
  expired: "outline",
};

function VerifyButton({
  grantId,
  assetId,
}: {
  grantId: string;
  assetId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await runAction(() => verifyAccessGrantAction(grantId, assetId), {
            success: "Access grant verified.",
            error: "Could not verify the access grant. Please try again.",
            onSuccess: () => router.refresh(),
          });
        })
      }
    >
      {isPending ? (
        <>
          <Spinner /> Verifying...
        </>
      ) : (
        "Verify"
      )}
    </Button>
  );
}

function DeleteGrantButton({
  grantId,
  assetId,
  personName,
}: {
  grantId: string;
  assetId: string;
  personName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      await runAction(() => deleteAccessGrantAction(grantId, assetId), {
        success: `Access for ${personName} revoked.`,
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete grant for ${personName}`}
              onClick={() => setOpen(true)}
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this access grant?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the grant record for {personName} —
              unlike revoking, it isn&apos;t kept for audit history. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AccessGrantsTable({
  grants,
  assetId,
}: {
  grants: AccessGrantRow[];
  assetId: string;
}) {
  if (grants.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No access grants recorded for this asset yet"
            description="Record who has access with Add access grant above."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Access level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead>Last verified</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell className="font-medium">
                  {personDisplayName(grant.person)}
                </TableCell>
                <TableCell className="app-muted">
                  {humanize(grant.access_level)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[grant.status] ?? "outline"}
                    className="capitalize"
                  >
                    {grant.status}
                  </Badge>
                </TableCell>
                <TableCell className="app-muted">{grant.granted_at}</TableCell>
                <TableCell className="app-muted">
                  {grant.last_verified || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {grant.status === "active" && (
                      <VerifyButton grantId={grant.id} assetId={assetId} />
                    )}
                    <AccessGrantDetailsSheet grant={grant} assetId={assetId} />
                    <DeleteGrantButton
                      grantId={grant.id}
                      assetId={assetId}
                      personName={grant.person?.name ?? "this person"}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
