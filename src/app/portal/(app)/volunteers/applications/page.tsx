import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { ApplicationsTable } from "./applications-table";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplication,
  type VolunteerApplicationStatus,
} from "./application-types";

type ApplicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isVolunteerApplicationStatus(
  value: string | undefined,
): value is VolunteerApplicationStatus {
  return (
    !!value &&
    (VOLUNTEER_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export default async function VolunteerApplicationsPage({
  searchParams,
}: ApplicationsPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteers", "manage");

  const params = await searchParams;
  const statusParam = params.status;
  const initialStatusFilter = isVolunteerApplicationStatus(
    Array.isArray(statusParam) ? statusParam[0] : statusParam,
  )
    ? (statusParam as VolunteerApplicationStatus)
    : null;

  const { data: applications, error } = await supabase
    .from("volunteer_applications")
    .select(
      "id, name, email, phone, role_interest, availability, status, created_at",
    )
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Applications
      </h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Volunteer interest submissions from the public site, ready to follow up
        on.
      </p>

      <div className="mt-6">
        {error ? (
          <p className="app-muted px-4 py-6 text-sm">
            Could not load volunteer applications. Please try again.
          </p>
        ) : (
          <ApplicationsTable
            applications={(applications ?? []) as VolunteerApplication[]}
            canManage={canManage}
            initialStatusFilter={initialStatusFilter}
          />
        )}
      </div>
    </>
  );
}
