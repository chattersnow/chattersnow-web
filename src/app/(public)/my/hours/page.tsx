import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPublicVocabulary, personRoleLabel } from "@/lib/person-roles";
import type {
  LoggableEvent,
  VolunteerRoleOption,
} from "@/lib/constituent/hours";
import { LogHoursForm } from "./hours-form";
import { MyNav } from "../my-nav";

const MY_HOURS_PATH = `${MY_PATH_PREFIX}/hours`;

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Log hours"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/**
 * Logging your own volunteer hours (#1165).
 *
 * Both pickers come back empty when the tenant has the Volunteers module off,
 * or the constituent area off, or the account is not linked -- every gate is
 * the RPCs' own, so this page never has to decide which of those it is. What
 * it does decide is whether there is a form worth showing at all: without a
 * record there is nothing to attach hours to, and `/my` is where that is
 * explained once.
 */
export default async function MyHoursPage() {
  const { personId } = await requireConstituentSession(MY_HOURS_PATH);
  if (!personId) redirect(MY_PATH_PREFIX);

  const supabase = await createSupabaseServerClient();
  const [{ data: events }, { data: roles }, vocabulary] = await Promise.all([
    supabase.rpc("my_loggable_events"),
    supabase.rpc("my_volunteer_role_types"),
    getPublicVocabulary(supabase),
  ]);

  return (
    <PageShell>
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
              Log your hours
            </h1>
          </div>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Tell us what you gave us and we will check it against our own notes.
            Once someone has confirmed it, it counts towards your{" "}
            {personRoleLabel("is_volunteer", vocabulary).toLowerCase()} total
            and towards what we report.
          </p>
          <MyNav current="hours" />
        </section>

        <Card>
          <CardContent>
            <LogHoursForm
              events={(events ?? []) as LoggableEvent[]}
              roles={(roles ?? []) as VolunteerRoleOption[]}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
