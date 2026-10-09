import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import { requirePermission } from "@/lib/auth/permissions";
import { parseGearRequestSettings } from "@/lib/gear-requests";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { GearRequestSettingsPanel } from "../request-settings-panel";
import { GearRequestPassphrasePanel } from "../request-passphrase-panel";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: `${(await getTenantLexicon(supabase)).collection} request settings`,
  };
}

/**
 * How the public request form behaves (#1547): delivery, postage and the
 * passphrase. A page of its own rather than cards under the queue, because
 * working requests and configuring the form are different jobs
 * (docs/portal-navigation.md, "Settings beside a work list"). Gated on the
 * same permission both server actions check.
 */
export default async function GearRequestSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const lexicon = await getTenantLexicon(supabase);
  await requirePermission(
    supabase,
    "inventory",
    "manage",
    `${lexicon.collection} request settings`,
  );

  const { data, error } = await supabase.rpc("get_gear_request_settings");
  const title = `${lexicon.collection} request settings`;

  return (
    <>
      <PortalBreadcrumbs current={title} />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {title}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        How the public {lexicon.collection_public.toLowerCase()} takes requests:
        how items are handed over, how postage is paid, and whether a passphrase
        is needed first.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load these settings. Please try again.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <GearRequestSettingsPanel
              settings={parseGearRequestSettings(data)}
              collectionLabel={lexicon.collection}
            />
            <GearRequestPassphrasePanel
              settings={parseGearRequestSettings(data)}
            />
          </>
        )}
      </div>
    </>
  );
}
