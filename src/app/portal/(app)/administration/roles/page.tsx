import { Card, CardContent } from "@/components/ui/card";
import { NewRoleDialog } from "./new-role-dialog";
import { RolesTable } from "./roles-table";
import { listRolesAction } from "../users/actions";

export default async function RolesPage() {
  const result = await listRolesAction();

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Roles
      </h1>

      <div className="mt-6 flex justify-end">
        <NewRoleDialog />
      </div>

      <div className="mt-6">
        {"error" in result ? (
          <Card>
            <CardContent className="app-muted text-sm">{result.error}</CardContent>
          </Card>
        ) : (
          <RolesTable roles={result.data} />
        )}
      </div>
    </>
  );
}
