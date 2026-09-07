import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
            resources={resources ?? []}
            rolePermissions={rolePermissions ?? []}
          />
        )}
      </div>
    </>
  );
}
