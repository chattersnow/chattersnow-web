import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listServicesWithAssetCounts } from "../queries";
import { NewServiceDialog } from "./new-service-dialog";
import { ServicesTable } from "./services-table";

export default async function ServicesPage() {
  const supabase = await createSupabaseServerClient();
  const servicesResult = await listServicesWithAssetCounts(supabase);

  return (
    <>
      <div className="rainbow-accent w-16" />
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/administration/access-management" />}
      >
        <ArrowLeft /> Access management
      </Button>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Services
      </h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        The providers (Zoho, Cloudflare, Meta, etc.) that assets belong to.
        Keeping this list clean avoids duplicate entries when adding assets.
      </p>

      <div className="mt-6 flex justify-end">
        <NewServiceDialog />
      </div>

      <div className="mt-6">
        {"error" in servicesResult ? (
          <Card>
            <CardContent className="app-muted text-sm">
              {servicesResult.error}
            </CardContent>
          </Card>
        ) : (
          <ServicesTable services={servicesResult.data} />
        )}
      </div>
    </>
  );
}
