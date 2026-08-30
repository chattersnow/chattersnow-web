import { Card, CardContent } from "@/components/ui/card";
import type { AccessGrantRow } from "@/lib/portal/access-management/types";
import { AccessGrantCard } from "./access-grant-card";

export function AccessGrantsList({
  grants,
  assetId,
}: {
  grants: AccessGrantRow[];
  assetId: string;
}) {
  if (grants.length === 0) {
    return (
      <Card>
        <CardContent className="app-muted px-4 py-6 text-sm">
          No access grants recorded for this asset yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {grants.map((grant) => (
        <AccessGrantCard key={grant.id} grant={grant} assetId={assetId} />
      ))}
    </div>
  );
}
