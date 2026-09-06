import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PlatformTenants } from "./platform-tenants";
import type { PlatformTenant } from "./platform-shared";

export const metadata: Metadata = {
  title: "Platform",
};

export default async function PlatformPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_list_tenants");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
        <p className="app-muted mt-1 max-w-3xl text-sm leading-relaxed">
          The organizations on this platform. Everything here is an
          organization&rsquo;s <em>metadata</em> — its name, domain, plan and
          status — never its data. Deleting an organization is deliberately not
          on this page: it stays a two-step command so it remains a considered
          act. Support access stays each organization&rsquo;s to grant; what
          shows below is only whether any is currently open.
        </p>
      </div>

      <PlatformTenants
        initialTenants={(data ?? []) as PlatformTenant[]}
        loadError={
          error ? "Could not load tenants. Reload to try again." : null
        }
      />
    </div>
  );
}
