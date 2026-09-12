import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";

/**
 * The organization's complete data export (#707 Phase 4), as a JSON download.
 *
 * A route handler rather than a Server Action because the result is a file:
 * an action would have to hand the whole document to the client bundle and
 * let it build a Blob. `export_current_tenant_data()` does the authorization
 * -- administration:manage in the current tenant, else null -- and the check
 * here only turns "null" into a proper status rather than an empty file.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "administration", "manage");
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: 403 });
  }

  const [tenantContext, { data, error }] = await Promise.all([
    getTenantContext(supabase),
    supabase.rpc("export_current_tenant_data"),
  ]);
  if (error || !data) {
    return NextResponse.json(
      { error: "Could not build the export. Please try again." },
      { status: 500 },
    );
  }

  const slug = currentTenant(tenantContext)?.slug ?? "organization";
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
