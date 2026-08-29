import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AssetsTable } from "./assets-table";
import { NewAssetDialog } from "./new-asset-dialog";
import {
  listAssets,
  listPeopleForAccessManagement,
  listServices,
} from "./queries";

export default async function AccessManagementPage() {
  const supabase = await createSupabaseServerClient();
  const [assetsResult, servicesResult, peopleResult] = await Promise.all([
    listAssets(supabase),
    listServices(supabase),
    listPeopleForAccessManagement(supabase),
  ]);

  return (
    <>
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Access Management
      </h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        External technology assets (domains, hosting, social accounts, and more)
        and who has access to them. This is not a credential store -- it never
        holds passwords, API keys, tokens, or recovery codes.
      </p>

      <div className="mt-6 flex justify-end">
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
          <AssetsTable assets={assetsResult.data} />
        )}
      </div>
    </>
  );
}
