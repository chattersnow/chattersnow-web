import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { detailTitle } from "@/lib/portal/detail-title";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserPermissions } from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { FieldCardSkeleton } from "@/components/portal/page-skeleton";
import { AspectActions } from "../aspects/aspect-action-row";
import { PERSON_ASPECTS } from "../aspects/registry";
import { aspectsFor } from "../aspects/types";
import { PEOPLE_WITH_ROLES, type PersonRow } from "../people-shared";
import { ContactFor } from "./contact-for";
import { PartnershipsCard } from "./partnerships-card";
import { PersonCoreCards } from "./person-core-cards";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: await detailTitle({
      table: "people",
      column: "name",
      id,
      fallback: "Person",
    }),
  };
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);

  // The only await in the page body. Everything else is a sibling async
  // component, so all of their queries start in the same wave rather than
  // waiting on one another -- and each streams in behind its own Suspense
  // boundary instead of the route's all-or-nothing loading.tsx.
  const { data: person } = await supabase
    .from(PEOPLE_WITH_ROLES)
    .select(
      // primary_contact is a computed relationship on the view; see
      // PERSON_COLUMNS in people-directory.tsx for why.
      "id, name, email, phone, instagram_handle, notes, logo_url, website, auth_user_id, is_donor, is_sponsor, is_volunteer, is_attendee, is_staff, person_type, riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain, primary_contact_person_id, primary_contact(id, name, email, phone)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!person) notFound();
  const personRow = person as unknown as PersonRow;

  return (
    <>
      <PortalBreadcrumbs current={personRow.name ?? "Person"} />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {personRow.name ?? "—"}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <Suspense>
        <ContactFor personId={personRow.id} />
      </Suspense>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<FieldCardSkeleton rows={4} />}>
          <PersonCoreCards person={personRow} />
        </Suspense>

        {/* One card per role the person actually holds. The flags come from
            the records behind them (20260903030000), so a person without
            is_donor provably has no donations -- before the registry every
            card rendered for everybody, empty or not. */}
        {aspectsFor(PERSON_ASPECTS, personRow).map((aspect) => (
          <Suspense key={aspect.key} fallback={<FieldCardSkeleton rows={3} />}>
            <aspect.HistoryCard
              personId={personRow.id}
              actions={
                <AspectActions aspect={aspect} permissions={permissions} />
              }
            />
          </Suspense>
        ))}

        <Suspense fallback={<FieldCardSkeleton rows={3} />}>
          <PartnershipsCard personId={personRow.id} />
        </Suspense>
      </div>
    </>
  );
}
