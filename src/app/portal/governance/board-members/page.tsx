import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogoutButton } from "../../logout-button";
import { PortalTabs } from "../../portal-tabs";
import { GovernanceTabs } from "../governance-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BoardMembersPage() {
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
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div className="flex min-w-0 items-center gap-3">
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
              <Link
                href="/portal/home"
                className="app-muted text-xs font-semibold uppercase tracking-[0.16em] hover:text-foreground"
              >
                Operations portal
              </Link>
              <h1 className="brand-display whitespace-nowrap text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Board Members
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LogoutButton />
          </div>
        </header>

        <PortalTabs />
        <GovernanceTabs />

        <div className="mt-10">
          <Card>
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
            </CardHeader>
            <CardContent className="app-muted text-sm">
              This area will list current and past board members, each with role/title,
              term start and end dates, and active status.
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
