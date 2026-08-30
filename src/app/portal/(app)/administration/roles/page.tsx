import { Card, CardContent } from "@/components/ui/card";
import { NewRoleDialog } from "./new-role-dialog";
import { RolesTable } from "./roles-table";
import { listRolesAction } from "../users/actions";

export default async function RolesPage() {
  const result = await listRolesAction();

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Roles
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <NewRoleDialog />
      </div>

      <div className="mt-6">
        {"error" in result ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {result.error}
            </CardContent>
          </Card>
        ) : (
          <RolesTable roles={result.data} />
        )}
      </div>
    </>
  );
}
