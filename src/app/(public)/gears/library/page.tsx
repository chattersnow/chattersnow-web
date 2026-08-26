import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { GearCatalog } from "../gear-catalog";

export const metadata: Metadata = {
  title: "Gear Library | Chatter Snow",
};

export default async function GearLibraryPage() {
  const supabase = await createSupabaseServerClient();

  const { data: items } = await supabase
    .from("public_gear_catalog")
    .select(
      "id, description, size, type, gender, condition, photo_url, created_at",
    )
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Gear library
      </h1>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        Browse gear currently available to Chatter Snow members.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        nativeButton={false}
        render={<Link href="/gears/sizing" />}
      >
        Sizing guide
      </Button>

      <div className="mt-10">
        <GearCatalog items={items ?? []} />
      </div>
    </div>
  );
}
