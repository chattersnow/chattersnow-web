import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { formatInstantDate } from "@/lib/format";
import { claimCandidatesAction } from "./actions";
import { ClaimReview } from "./claim-review";

export const metadata: Metadata = {
  title: "Account claims",
};

/**
 * The review queue for #1162.
 *
 * A queue under People rather than a section of its own, the same shape the
 * duplicates queue takes: this is the People directory's job seen from a
 * different angle, not a different job (`docs/portal-navigation.md`). It is
 * gated on `constituent_claims`, which belongs to the `constituent_accounts`
 * module -- so on a tenant that has not enabled the constituent area,
 * `has_permission()` is false for everyone and this page refuses, which is
 * right: there is nothing to review where nobody can sign up.
 */
export default async function PersonClaimsPage() {
  const supabase = await createSupabaseServerClient();
  // The people layout only requires people:view. Deciding who gets to read a
  // person's giving history is its own permission.
  await requirePermission(supabase, "constituent_claims", "manage", "People");

  const { data: claims } = await supabase
    .from("person_claims")
    .select(
      "id, stated_name, stated_email, stated_phone, stated_instagram_handle, note, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows = claims ?? [];
  const candidates = await Promise.all(
    rows.map((claim) => claimCandidatesAction(claim.id)),
  );

  return (
    <div className="space-y-6">
      <PortalBreadcrumbs current="Account claims" />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Account claims
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div>
        <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed">
          People who have made an account on the website and asked to be linked
          to their record. Approving one lets that account see its own events,
          volunteering, giving and gear — so check something beyond a similar
          name before you link it.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing waiting</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((claim, index) => (
            <Card key={claim.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {claim.stated_name}
                  <Badge variant="outline">
                    {formatInstantDate(claim.created_at)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="app-muted inline">They gave: </dt>
                    <dd className="inline">
                      {claim.stated_email ?? "no email"}
                      {claim.stated_instagram_handle
                        ? ` · @${claim.stated_instagram_handle}`
                        : ""}
                      {claim.stated_phone ? ` · ${claim.stated_phone}` : ""}
                    </dd>
                  </div>
                </dl>

                {claim.note && (
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {claim.note}
                  </p>
                )}

                <ClaimReview
                  claimId={claim.id}
                  candidates={candidates[index]}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
