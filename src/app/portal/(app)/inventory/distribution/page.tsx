import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { listDistributionsAction } from "../../home/distribution-actions";
import { RecordDistributionModal } from "../../home/record-distribution-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { DistributionTable } from "./distribution-table";
import { EmptyState } from "@/components/portal/empty-state";

export const metadata: Metadata = {
  title: "Distribution",
};

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
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Distribution
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        {canRecord ? (
          <RecordDistributionModal
            triggerLabel="Record distribution"
            showRecipientField
          />
        ) : (
          <div />
        )}
      </div>

      <div className="mt-6">
        {"error" in result ? (
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : result.data.length === 0 ? (
          // The "nothing recorded yet" sentence stays here rather than
          // becoming the table's empty message: it carries the action that
          // fills the page, and PortalDataTable's message is for a list that
          // has been emptied, not one that was never filled.
          <Card>
            <CardContent className="px-0">
              <EmptyState
                title="No distributions recorded yet"
                description={
                  canRecord
                    ? "Record the first one with Record distribution above."
                    : "Distributions appear here once gear is handed out."
                }
              />
            </CardContent>
          </Card>
        ) : (
          <DistributionTable movements={result.data} />
        )}
      </div>
    </>
  );
}
