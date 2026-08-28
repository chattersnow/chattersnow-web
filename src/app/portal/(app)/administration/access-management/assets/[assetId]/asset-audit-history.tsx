import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionBadge } from "../../../audit-log/audit-log-badges";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AuditEntry = { id: string; action: string; occurred_at: string };

export async function AssetAuditHistory({
  supabase,
  assetId,
}: {
  supabase: SupabaseClient;
  assetId: string;
}) {
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, occurred_at")
    .eq("table_name", "assets")
    .eq("record_id", assetId)
    .order("occurred_at", { ascending: false })
    .limit(10);

  const entries = (data ?? []) as AuditEntry[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Audit history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="app-muted text-sm">No recorded changes yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <ActionBadge action={entry.action} />
                <span className="app-muted">
                  {dateFormatter.format(new Date(entry.occurred_at))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/portal/administration/audit-log?table=assets`}
          className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
        >
          View full audit log for assets
        </Link>
      </CardContent>
    </Card>
  );
}
