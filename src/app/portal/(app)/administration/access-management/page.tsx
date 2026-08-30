import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AssetsTable } from "./assets-table";
import { NewAssetDialog } from "./new-asset-dialog";
import {
  listActiveGrantCountsByAsset,
  listAssets,
  listPeopleForAccessManagement,
  listServices,
} from "./queries";

export default async function AccessManagementPage() {
  const supabase = await createSupabaseServerClient();
  const [assetsResult, servicesResult, peopleResult, activeGrantCounts] =
    await Promise.all([
      listAssets(supabase),
      listServices(supabase),
      listPeopleForAccessManagement(supabase),
      listActiveGrantCountsByAsset(supabase),
    ]);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Access Management
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        External technology assets (domains, hosting, social accounts, and more)
        and who has access to them. This is not a credential store -- it never
        holds passwords, API keys, tokens, or recovery codes.
      </p>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <Button
          variant="secondary"
          nativeButton={false}
          render={
            <Link href="/portal/administration/access-management/services" />
          }
        >
          Manage services
        </Button>
        {"error" in servicesResult || "error" in peopleResult ? null : (
          <NewAssetDialog
            services={servicesResult.data}
            people={peopleResult.data}
          />
        )}
      </div>

      <div className="mt-6">
        {"error" in assetsResult ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {assetsResult.error}
            </CardContent>
          </Card>
        ) : (
          <AssetsTable
            assets={assetsResult.data}
            activeGrantCounts={activeGrantCounts}
          />
        )}
      </div>
    </>
  );
}
