import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";

/**
 * A tenant's complete data export, as a JSON download (#707 Phase 5c).
 *
 * A route handler rather than a Server Action for the same reason as
 * `system-settings/export`: the result is a file, and an action would have to
 * hand the whole document to the client bundle to build a Blob. The difference
 * is whose data it is -- that route exports the caller's own tenant, this one
 * exports any tenant, so `platform_export_tenant()` does the authorization and
 * the check here only turns a refusal into a status rather than an empty file.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant");
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant named." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "platform_tenants", "manage");
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("platform_export_tenant", {
    p_tenant_id: tenantId,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: "Could not build the export. Please try again." },
      { status: 500 },
    );
  }

  const slug =
    (data as { tenant?: { slug?: string } }).tenant?.slug ?? "tenant";
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
