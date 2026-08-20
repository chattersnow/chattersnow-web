import Image from "next/image";
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
        <header className="flex items-center gap-3 border-b border-[var(--line)] pb-6">
          <Image
            src="/chatter-logo-transparent.png"
            alt="Chatter Snow"
            width={150}
            height={200}
            className="h-14 w-auto shrink-0 sm:h-16"
            style={{ width: "auto" }}
            priority
          />
          <div className="min-w-0">
            <p className="app-muted text-xs font-semibold uppercase tracking-[0.16em]">
              Available gear
            </p>
            <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Gear library
            </h1>
            <p className="app-muted mt-1 text-sm">
              Browse gear currently available to Chatter Snow members.
            </p>
          </div>
        </header>

        <div className="mt-10">
          <GearCatalog items={items ?? []} />
        </div>
      </div>
    </main>
  );
}
