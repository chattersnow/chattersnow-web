import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { getTenantModules } from "@/lib/page-visibility";
import { deviceClass } from "@/lib/portal/device";
import { moduleEnabled } from "@/lib/portal/modules";
import { roleDisplayName } from "@/lib/format";
import type { PermissionLevel } from "@/lib/auth/permissions";
import { PermissionReferenceView } from "./permission-reference-view";

export const metadata: Metadata = {
  title: "Permission Reference · Administration",
};

/**
 * Every resource in the permission catalog, explained end to end (#1324).
 *
 * The sheet on Administration → Roles → Permissions answers one row while an
 * administrator is deciding it; this is the same content laid out to be read
 * through, linked from the portal's help panel, and searchable when the
 * question is "which resource covers X".
 *
 * Unlike the matrix this does *not* drop a resource whose module is off. The
 * matrix is a form -- offering a cell that would do nothing reads as a bug --
 * while a reference that silently omits a row cannot answer "why can nobody
 * reach Reimbursements?". The rows are marked inert instead.
 */
export default async function PermissionReferencePage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: resources },
    { data: rolePermissions },
    { data: roles },
    { data: moduleRows },
    modules,
    device,
  ] = await Promise.all([
    supabase
      .from("resources")
      .select("id, key, section, label, description, sort_order, module_key")
      .order("sort_order"),
    supabase.from("role_permissions").select("role_id, resource_id, level"),
    supabase.from("roles").select("id, name, label, description").order("name"),
    supabase.from("modules").select("key, label"),
    getTenantModules(supabase),
    // The rail is a sticky column at a desk and a sheet on a phone, and the
    // choice is made on the server so neither flashes the other first.
    deviceClass(),
  ]);

  const roleNameById = new Map(
    (roles ?? []).map((role) => [role.id as string, roleDisplayName(role)]),
  );
  const resourceKeyById = new Map(
    (resources ?? []).map((resource) => [
      resource.id as string,
      resource.key as string,
    ]),
  );

  const holdersByResource: Record<
    string,
    { role: string; level: PermissionLevel }[]
  > = {};
  for (const rp of rolePermissions ?? []) {
    if (rp.level === "none") continue;
    const key = resourceKeyById.get(rp.resource_id as string);
    const role = roleNameById.get(rp.role_id as string);
    if (!key || !role) continue;
    (holdersByResource[key] ??= []).push({
      role,
      level: rp.level as PermissionLevel,
    });
  }
  for (const list of Object.values(holdersByResource)) {
    list.sort((a, b) => a.role.localeCompare(b.role));
  }

  return (
    <>
      {/* Exactly the sidebar's label, so the trail does not repeat it
          as its own last step. */}
      <PortalBreadcrumbs current="Permission Reference" />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Permission Reference
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <PermissionReferenceView
        device={device}
        resources={(resources ?? []).map((resource) => ({
          key: resource.key as string,
          section: resource.section as string,
          label: resource.label as string,
          description: resource.description as string | null,
          module_key: resource.module_key as string | null,
        }))}
        holdersByResource={holdersByResource}
        moduleLabels={Object.fromEntries(
          (moduleRows ?? []).map((module) => [
            module.key as string,
            module.label as string,
          ]),
        )}
        disabledModules={Object.fromEntries(
          (moduleRows ?? [])
            .map((module) => module.key as string)
            .filter((key) => !moduleEnabled(modules, key))
            .map((key) => [key, true]),
        )}
      />
    </>
  );
}
