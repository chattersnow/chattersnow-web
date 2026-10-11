import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import {
  donorLabel,
  withFlatItemCategories,
  type DonationRow,
} from "../donation-shared";
import { DonationDetailView } from "./donation-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ donationId: string }>;
}): Promise<Metadata> {
  const { donationId } = await params;
  // Titled by donor, which is a joined relation rather than a plain column,
  // so this can't use the shared detailTitle helper.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("donations")
    .select("donor:people!inner(name, is_anonymous)")
    .eq("id", donationId)
    .maybeSingle<{ donor: { name: string | null; is_anonymous: boolean } }>();
  const donor = data?.donor;
  const name = donor && (donor.is_anonymous ? "Anonymous" : donor.name?.trim());
  return { title: name ? `Donation from ${name}` : "Gear Donation" };
}

export default async function DonationDetailPage({
  params,
}: {
  params: Promise<{ donationId: string }>;
}) {
  const { donationId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: donation, error }, { data: events }] = await Promise.all([
    supabase
      .from("donations")
      .select(
        "id, donated_at, notes, event_id, donor:people!inner(id, name, is_anonymous, source_type), event:events(id, name), inventory_items(id, description, type, category_id, size, gender, condition, face_value, status, intended_use, photo_url, notes, inventory_categories(key, label))",
      )
      .eq("id", donationId)
      .order("id", { referencedTable: "inventory_items", ascending: true })
      .maybeSingle(),
    // The same capped list the donations page filters by, for the edit
    // sheet's event picker.
    supabase
      .from("events")
      .select("id, name")
      .order("starts_at", { ascending: false })
      .limit(200),
  ]);

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this donation. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!donation) notFound();
  const row = donation as unknown as DonationRow;

  return (
    <>
      <PortalBreadcrumbs
        current={donorLabel(row.donor)}
        // A donation taken at an event sits under that event's donations,
        // so the trail leads back to the list filtered to it.
        parents={
          row.event
            ? [
                {
                  label: row.event.name,
                  href: `/portal/inventory/donations?event=${row.event.id}`,
                },
              ]
            : undefined
        }
      />

      <DonationDetailView
        donation={withFlatItemCategories(row)}
        events={events ?? []}
      />
    </>
  );
}
