import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GearCatalog } from "./gear-catalog";

export const metadata: Metadata = {
  title: "Available Gear | Chatter Snow",
};

export default async function GearsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: items } = await supabase
    .from("public_gear_catalog")
    .select("id, description, size, type, gender, condition, photo_url, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Gear library
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Browse gear currently available to Chatter Snow members.
          </p>
        </section>

        <div className="mt-10">
          <GearCatalog items={items ?? []} />
        </div>
      </div>
    </main>
  );
}
