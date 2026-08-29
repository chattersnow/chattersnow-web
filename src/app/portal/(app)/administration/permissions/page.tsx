import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
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
      <div className="rainbow-accent w-16" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Permissions
        </h1>
        <HowToSheet title="How the permissions matrix works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Pick a role&apos;s row and a resource&apos;s column, then click
                the cell to cycle it through{" "}
                <strong className="text-foreground">None</strong>,{" "}
                <strong className="text-foreground">View</strong>, and{" "}
                <strong className="text-foreground">Manage</strong>. Manage
                includes everything View does, plus the ability to create, edit,
                or delete.
              </li>
              <li>
                There&apos;s no separate save step — each click writes
                immediately.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Who can do this">
            <p>
              Only <strong className="text-foreground">admin</strong> —
              Administration (users, permissions, settings, audit log) is
              admin-only across the whole portal.
            </p>
          </HowToSection>
          <HowToSection heading="What happens downstream">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Route guards and the sidebar nav both read this same matrix on
                every request, so a role loses or gains a page immediately — no
                re-login, no deploy.
              </li>
              <li>
                A new role you create starts with no permissions on any resource
                until you grant them here.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="Common mistakes">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Removing the last admin&apos;s Manage on Administration locks
                everyone, including you, out of this page — keep at least one
                admin with full access.
              </li>
              <li>
                A role with View but not Manage on a resource can still open
                that page, but every create/edit/delete action on it stays
                disabled or hidden.
              </li>
            </ul>
          </HowToSection>
        </HowToSheet>
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
