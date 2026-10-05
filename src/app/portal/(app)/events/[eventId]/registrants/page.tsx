import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { RegistrantsPage } from "./registrants-page";

export const metadata: Metadata = { title: "Registrants" };

/**
 * Every registrant of one event, at full portal width (#1511).
 *
 * Was the "View all" sheet on the event's registrants card, which had grown
 * into the door's check-in loop, walk-ins, messaging and export -- a
 * destination, so it gets a URL, a breadcrumb and the back button. The card
 * keeps its capped preview and links here.
 *
 * Read at `events: view`, as the card is: RLS hides an event this reader may
 * not see, which is the 404 below. The row actions are gated on
 * `events: manage` here and again in every action they call.
 */
export default async function EventRegistrantsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "events", "view")) notFound();
  const canManage = hasPermission(permissions, "events", "manage");

  const { data: event, error } = await supabase
    .from("events")
    .select("id, name, starts_at, timezone, capacity, registration_enabled")
    .eq("id", eventId)
    .maybeSingle<{
      id: string;
      name: string;
      starts_at: string;
      timezone: string;
      capacity: number | null;
      registration_enabled: boolean;
    }>();

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this event. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!event) notFound();

  return (
    <>
      <PortalBreadcrumbs
        current="Registrants"
        parents={[
          {
            label: event.name,
            href: `/portal/events/${encodeURIComponent(event.id)}?tab=registrants`,
          },
        ]}
      />

      <RegistrantsPage
        eventId={event.id}
        eventName={event.name}
        startsAt={event.starts_at}
        timezone={event.timezone}
        capacity={event.capacity}
        registrationOpen={event.registration_enabled}
        canManage={canManage}
      />
    </>
  );
}
