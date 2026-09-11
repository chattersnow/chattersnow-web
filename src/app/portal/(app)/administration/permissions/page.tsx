import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantModules } from "@/lib/page-visibility";
import { moduleEnabled } from "@/lib/portal/modules";
import { Card, CardContent } from "@/components/ui/card";
import { PermissionsMatrix } from "./permissions-matrix";

export const metadata: Metadata = {
  title: "Permissions",
};

export default async function PermissionsPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: roles, error: rolesError },
    { data: resources, error: resourcesError },
    { data: rolePermissions, error: rolePermissionsError },
    modules,
  ] = await Promise.all([
    supabase.from("roles").select("id, name, description").order("name"),
    supabase
      .from("resources")
      .select("id, key, section, label, description, sort_order, module_key")
      .order("sort_order"),
    supabase.from("role_permissions").select("role_id, resource_id, level"),
    getTenantModules(supabase),
  ]);

  const error = rolesError || resourcesError || rolePermissionsError;

  // FILTERED, not shown-and-inert (#903).
  //
  // `resources` is the platform's global catalog, so without this the matrix
  // offers a column for every resource the product has ever had, whatever this
  // organization was sold. An admin could set `finance: manage` on a role and
  // watch it do nothing: the grant is genuinely written, and `my_permissions()`
  // correctly reports `none` for a resource whose module is off -- which reads
  // as a bug in the permissions screen rather than as an entitlement.
  //
  // 20260908010000 faced the same fork for the inert `platform_tenants` grant
  // and took the other branch: suppress it from *effective* permissions, but
  // leave the row visible as something somebody set. The two are decided
  // differently on purpose. That grant is inert per *user* -- the row means
  // something for the operator reading the same screen, so hiding it would
  // hide a real assignment. A disabled module is off for the whole tenant and
  // for everyone in it, and the audience of this screen is assigning access
  // within what the organization has, not auditing the platform's catalog.
  //
  // Nothing is deleted, in keeping with "off is hidden and frozen": existing
  // grants on a hidden resource stay in `role_permissions` untouched -- the
  // save action upserts only the cells that changed -- so re-enabling a module
  // brings the section back with its matrix exactly as it was.
  const visibleResources = (resources ?? []).filter((resource) =>
    moduleEnabled(modules, resource.module_key),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Permissions
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {error ? (
          <Card>
            <CardContent className="app-muted text-sm">
              Could not load the permissions matrix. Please try again.
            </CardContent>
          </Card>
        ) : (
          <PermissionsMatrix
            roles={roles ?? []}
            resources={visibleResources}
            rolePermissions={rolePermissions ?? []}
          />
        )}
      </div>
    </>
  );
}
