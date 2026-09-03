import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { donorLabel, type DonationRow } from "../donation-shared";
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

  const { data: donation, error } = await supabase
    .from("donations")
    .select(
      "id, donated_at, notes, event_id, donor:people!inner(id, name, is_anonymous, source_type), event:events(id, name), inventory_items(id, description, type, size, gender, condition, face_value, status, photo_url, notes)",
    )
    .eq("id", donationId)
    .maybeSingle();

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

  return (
    <>
      <PortalBreadcrumbs
        current={donorLabel((donation as unknown as DonationRow).donor)}
      />

      <DonationDetailView donation={donation as unknown as DonationRow} />
    </>
  );
}
