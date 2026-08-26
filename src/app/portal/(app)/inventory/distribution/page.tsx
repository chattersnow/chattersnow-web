import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { listDistributionsAction } from "../../home/distribution-actions";
import { RecordDistributionModal } from "../../home/record-distribution-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function DistributionPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canRecord = hasAnyPermission(permissions, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);

  const result = await listDistributionsAction();

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Distribution
      </h1>

      <div className="mt-6 flex flex-col gap-4">
        {canRecord && (
          <RecordDistributionModal
            triggerLabel="Record distribution"
            showRecipientField
          />
        )}

        {"error" in result ? (
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : result.data.length === 0 ? (
          <p className="app-muted text-sm">No distributions recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="max-w-xs font-medium">
                    <span
                      className="block truncate"
                      title={movement.inventory_item?.description ?? undefined}
                    >
                      {movement.inventory_item?.description ?? "—"}
                    </span>
                    <span className="app-muted block text-xs">
                      {movement.inventory_item?.type}
                    </span>
                  </TableCell>
                  <TableCell>{movement.quantity}</TableCell>
                  <TableCell className="app-muted">
                    {dateFormatter.format(new Date(movement.occurred_at))}
                  </TableCell>
                  <TableCell
                    className="max-w-xs truncate app-muted"
                    title={movement.event?.name ?? undefined}
                  >
                    {movement.event?.name ?? "—"}
                  </TableCell>
                  <TableCell
                    className="max-w-xs truncate app-muted"
                    title={movement.recipient?.name ?? undefined}
                  >
                    {movement.recipient?.name ?? "—"}
                  </TableCell>
                  <TableCell className="app-muted">
                    {movement.reason || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
