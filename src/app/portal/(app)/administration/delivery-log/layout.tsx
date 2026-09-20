import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export default async function AdministrationDeliveryLogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  // administration:manage, matching notification_deliveries' own select policy
  // (20260906140000) rather than widening it. A module manager may read the
  // correspondence about their own records through the Messages card
  // (#1203/#1204, `outbound_messages`); the organization's whole mail history
  // is a different question and a different audience.
  await requirePermission(
    supabase,
    "administration",
    "manage",
    "Email Delivery",
  );
  return children;
}
