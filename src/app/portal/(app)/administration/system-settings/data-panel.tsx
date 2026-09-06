import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The organization's data (#707 Phase 4): a complete export any admin can
 * take, and the route to deletion, which is a platform operation.
 */
export function DataPanel({ orgName }: { orgName: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Export everything</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="app-muted text-sm leading-relaxed">
            One JSON file with every record {orgName} holds in the portal:
            people, events, donations, inventory, finance, governance, settings,
            site content, memberships and the audit trail. It is the copy to
            keep, and the input to a move off this platform.
          </p>
          <p className="app-muted text-sm leading-relaxed">
            It contains personal data. Store it as carefully as the portal does
            and delete it when it has served its purpose.
          </p>
          <Button
            nativeButton={false}
            render={<a href="/portal/administration/system-settings/export" />}
          >
            <Download />
            Download export
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leaving the platform</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="app-muted text-sm leading-relaxed">
            Deleting an organization removes every record above, its audit trail
            and its site, and cannot be undone. Take an export first.
          </p>
          <p className="app-muted text-sm leading-relaxed">
            Deletion is carried out by the platform operator once the
            organization is archived, so it is requested rather than clicked:
            contact the platform with the request from an admin account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
