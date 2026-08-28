import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { listDistributionsAction } from "../../home/distribution-actions";
import { RecordDistributionModal } from "../../home/record-distribution-modal";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Distribution
        </h1>
        <HowToSheet title="How distribution works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong className="text-foreground">
                  Item leaves inventory
                </strong>{" "}
                — record which item, how many, and when.
              </li>
              <li>
                <strong className="text-foreground">
                  Event and recipient are optional
                </strong>{" "}
                — tie a distribution to an event and/or a recipient when
                it&apos;s relevant, or leave them blank for a general
                distribution.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Who can do this">
            <p>
              Anyone with manage access to inventory or inventory intake — this
              includes <strong className="text-foreground">admin</strong> and{" "}
              <strong className="text-foreground">volunteer</strong> (volunteers
              can edit distribution/gear-checkout records even though they
              don&apos;t get full Inventory reports access).
            </p>
          </HowToSection>
          <HowToSection heading="What happens downstream">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                There&apos;s no approval step — recording a distribution here
                immediately reduces the item&apos;s on-hand quantity.
              </li>
              <li>
                It&apos;s written to the audit log against the item&apos;s
                movement history, alongside its receive and adjustment
                transactions.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="Common mistakes">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Recording a new distribution to fix an earlier mistake, when a
                correction/adjustment would keep the on-hand total accurate
                instead of two movements fighting each other.
              </li>
              <li>
                Leaving the recipient blank for a personal handout makes the
                item impossible to trace back to who took it later.
              </li>
            </ul>
          </HowToSection>
        </HowToSheet>
      </div>

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
