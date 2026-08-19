import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PortalHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-end justify-between border-b border-[var(--line)] pb-6">
          <div>
            <p className="app-eyebrow">
              Chatter Snow
            </p>
            <h1 className="brand-display mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Operations portal
            </h1>
          </div>
          <span className="app-muted hidden text-xs font-semibold uppercase tracking-[0.16em] sm:block">
            Member view
          </span>
        </header>

        <section className="mt-10">
          <p className="app-muted text-sm font-semibold uppercase tracking-[0.16em]">
            Overview
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              ["Upcoming events", "0", "Events will appear here"],
              ["Gear available", "0", "Inventory tracking is next"],
              ["Donations this month", "$0", "Donation summaries are next"],
            ].map(([label, value, detail]) => (
              <article
                key={label}
                className="app-panel p-6"
              >
                <p className="app-muted text-sm font-semibold">{label}</p>
                <p className="brand-display mt-6 text-4xl font-semibold tracking-[-0.04em]">{value}</p>
                <p className="app-muted mt-2 text-sm">{detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}