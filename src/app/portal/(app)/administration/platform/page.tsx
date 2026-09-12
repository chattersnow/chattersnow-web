import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PlatformTenants } from "./platform-tenants";
import type { PlatformTenant } from "./platform-shared";

export const metadata: Metadata = {
  title: "Platform",
};

export default async function PlatformPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, packs] = await Promise.all([
    supabase.rpc("platform_list_tenants"),
    // This tenant's own offered packs (#895) -- provisioning copies them into
    // the new organization as drafts. A failed read leaves the checkbox list
    // out rather than failing the page; an operator can add a pack afterwards
    // from the organization's own Articles screen.
    supabase
      .from("content_packs")
      .select("key, name")
      .eq("is_offered", true)
      .order("name"),
  ]);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Platform
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        The organizations on this platform and their metadata — name, domain,
        plan and status.
      </p>

      <div className="mt-6">
        <PlatformTenants
          initialTenants={(data ?? []) as PlatformTenant[]}
          offeredPacks={(packs.data ?? []) as { key: string; name: string }[]}
          loadError={
            error ? "Could not load tenants. Reload to try again." : null
          }
        />
      </div>
    </>
  );
}
