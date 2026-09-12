import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { NewRoleTypeDialog } from "./new-role-type-dialog";
import { RoleTypesTable } from "./role-types-table";
import type { RoleTypeRow } from "./role-type-details-sheet";

export const metadata: Metadata = {
  title: "Roles · Volunteers",
};

export default async function VolunteerRolesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteers", "manage");

  const { data: roleTypes, error } = await supabase
    .from("volunteer_role_types")
    .select("id, name, description, is_public")
    .order("name", { ascending: true });

  return (
    <>
      <PortalBreadcrumbs current="Roles" />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Roles
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Named volunteer job types (e.g. Ride Buddy, Event Setup, Basecamp
        Staffing) that events and logged hours can be tagged with.
      </p>

      {canManage ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewRoleTypeDialog />
        </div>
      ) : null}

      {error || !roleTypes || roleTypes.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            {error ? (
              <p className="app-muted px-4 py-6 text-sm">
                Could not load role types. Please try again.
              </p>
            ) : (
              <EmptyState
                title="No role types yet"
                description={
                  canManage
                    ? "Add the first one with New role type above."
                    : "Role types appear here once someone with volunteers access creates one."
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        // PortalDataTable brings its own card.
        <div className="mt-6">
          <RoleTypesTable
            roleTypes={roleTypes as RoleTypeRow[]}
            canManage={canManage}
          />
        </div>
      )}
    </>
  );
}
