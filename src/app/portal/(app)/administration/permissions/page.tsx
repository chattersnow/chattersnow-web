import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
import { PermissionsMatrix } from "./permissions-matrix";

export default async function PermissionsPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: roles, error: rolesError },
    { data: resources, error: resourcesError },
    { data: rolePermissions, error: rolePermissionsError },
  ] = await Promise.all([
    supabase.from("roles").select("id, name, description").order("name"),
    supabase
      .from("resources")
      .select("id, key, section, label, description, sort_order")
      .order("sort_order"),
    supabase.from("role_permissions").select("role_id, resource_id, level"),
  ]);

  const error = rolesError || resourcesError || rolePermissionsError;

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Permissions
      </h1>

      <div className="mt-6 space-y-4">
        <WorkflowInfoCard title="How the permissions matrix works">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Three levels per resource
              </strong>{" "}
              — None, View, or Manage. Manage includes everything View does,
              plus the ability to create, edit, or delete.
            </li>
            <li>
              <strong className="text-foreground">
                Changes take effect immediately
              </strong>{" "}
              — a role&apos;s permissions are checked fresh on every page load
              and action, so there&apos;s no re-login or cache to clear after
              editing a cell here.
            </li>
          </ol>
          <p className="mt-3">
            This matrix is the single source of truth for what each role can see
            and do across the whole portal.
          </p>
        </WorkflowInfoCard>
        {error ? (
          <Card>
            <CardContent className="app-muted text-sm">
              Could not load the permissions matrix. Please try again.
            </CardContent>
          </Card>
        ) : (
          <PermissionsMatrix
            roles={roles ?? []}
            resources={resources ?? []}
            rolePermissions={rolePermissions ?? []}
          />
        )}
      </div>
    </>
  );
}
