"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { NewRoleDialog } from "./new-role-dialog";
import { PermissionsMatrix, type MatrixResource } from "./permissions-matrix";
import type { RoleRow } from "./role-details-dialog";
import { RolesTable } from "./roles-table";

const TABS = ["roles", "permissions"] as const;
type TabValue = (typeof TABS)[number];

function isTabValue(value: string): value is TabValue {
  return (TABS as readonly string[]).includes(value);
}

/**
 * A role's identity and a role's access, on one page (#946).
 *
 * They were two sidebar entries -- Roles and Permissions -- with Access
 * Management sitting between them, so making a working role meant finding both
 * and knowing they were related. They are one object seen twice, which the
 * navigation rule in `docs/portal-navigation.md` answers with tabs.
 */
export function RolesView({
  roles,
  rolesError,
  resources,
  rolePermissions,
  matrixFailed,
}: {
  roles: RoleRow[];
  rolesError: string | null;
  resources: MatrixResource[];
  rolePermissions: { role_id: string; resource_id: string; level: string }[];
  matrixFailed: boolean;
}) {
  const [tab, setTab] = useUrlTabState<TabValue>({
    fallback: "roles",
    isValid: isTabValue,
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as TabValue)}
      className="mt-6"
    >
      <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="roles">All roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>
        {/* Creating a role is offered from both tabs on purpose: realising a
            role is missing is something that happens while granting access,
            and the Permissions tab is where that happens. */}
        <NewRoleDialog />
      </div>

      <TabsContent value="roles" className="mt-4">
        {rolesError ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {rolesError}
            </CardContent>
          </Card>
        ) : (
          <RolesTable roles={roles} />
        )}
      </TabsContent>

      {/* keepMounted, unlike event detail's phases, which are unmounted so
          only the phase you are looking at runs its queries. This panel holds
          unsaved work -- pending cell edits waiting on the confirm dialog --
          and unmounting would discard them silently when a reader clicks back
          to the role list to check a name. */}
      <TabsContent value="permissions" className="mt-4" keepMounted>
        {matrixFailed || rolesError ? (
          <Card>
            <CardContent className="app-muted text-sm">
              Could not load the permissions matrix. Please try again.
            </CardContent>
          </Card>
        ) : (
          <PermissionsMatrix
            roles={roles}
            resources={resources}
            rolePermissions={rolePermissions}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
