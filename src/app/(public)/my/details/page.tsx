import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import type { MyContactDetails } from "@/lib/constituent/contact";
import { ContactForm } from "./contact-form";
import { EmailChangeForm } from "./email-form";

const MY_DETAILS_PATH = `${MY_PATH_PREFIX}/details`;

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your details"),
  };
}

/**
 * Correcting your own contact details (#1164).
 *
 * A page of its own rather than a section of `/my`, on the rule
 * docs/portal-navigation.md states: keeping your record current is a different
 * job from reading what you have done, not a different view of it. The link
 * between them is the navigation.
 *
 * An account that is signed in but not yet linked to a record is sent back to
 * `/my`, which is where the claim form is. There is nothing to edit until a
 * staffer has approved the claim, and a form with no record behind it would
 * fail at the database with nothing useful to say.
 */
export default async function MyDetailsPage() {
  const { personId } = await requireConstituentSession(MY_DETAILS_PATH);
  if (!personId) redirect(MY_PATH_PREFIX);

  const supabase = await createSupabaseServerClient();

  // Read through my_contact_details(), not `.from("people")`: the people select
  // policy requires people:view, which the person reading their own record has
  // no reason to hold. The RPC takes no argument, so there is nothing here that
  // decides whose record comes back.
  const { data } = await supabase.rpc("my_contact_details");
  const details = ((data ?? []) as MyContactDetails[])[0];

  // The guard said there is a record and the RPC says there is not, which can
  // only mean the tenant turned the area off between the two. `/my` is where
  // that is handled once, with a 404.
  if (!details) redirect(MY_PATH_PREFIX);

  return (
    <div className="space-y-8">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Your details
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Keep this current and we will reach you. Everything here is yours to
          change; the rest of your record is ours to keep.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="brand-display text-lg font-semibold">
            Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmailChangeForm
            email={details.email}
            pendingEmail={details.email_pending}
            pendingExpiresAt={details.email_pending_expires_at}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="brand-display text-lg font-semibold">
            Everything else
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm details={details} />
        </CardContent>
      </Card>

      <Link href={MY_PATH_PREFIX} className="app-muted text-sm underline">
        Back to your account
      </Link>
    </div>
  );
}
