import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DonationRow } from "../donation-shared";
import { DonationDetailView } from "./donation-detail-view";

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
      <div className="rainbow-accent w-16" />
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/inventory/donations" />}
      >
        <ArrowLeft /> Donations
      </Button>

      <DonationDetailView donation={donation as unknown as DonationRow} />
    </>
  );
}
