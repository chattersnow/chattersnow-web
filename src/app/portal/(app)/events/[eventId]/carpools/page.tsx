import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { listEventRegistrantsAction } from "../../registrants-actions";
import { CarpoolBoard } from "./carpool-board";

export const metadata: Metadata = { title: "Carpools" };

/**
 * The event's carpool board (#1649): which car, who drives, who rides with
 * whom, and who has paid their driver.
 *
 * Read at `events: view`, as the registrants page is: RLS hides an event this
 * reader may not see, which is the 404 below. The changes are offered at
 * `events: manage` and gated again in every action and function they call.
 */
export default async function EventCarpoolsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "events", "view")) notFound();
  const canManage = hasPermission(permissions, "events", "manage");

  const [{ data: event, error }, registrants] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, starts_at, timezone, carpools_enabled")
      .eq("id", eventId)
      .maybeSingle(),
    listEventRegistrantsAction(eventId),
  ]);

  if (error || "error" in registrants) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this event. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!event) notFound();

  const breadcrumbs = (
    <PortalBreadcrumbs
      current="Carpools"
      parents={[
        {
          label: event.name,
          href: `/portal/events/${encodeURIComponent(event.id)}?tab=carpools`,
        },
      ]}
    />
  );

  if (!event.carpools_enabled || !registrants.data.carpools) {
    return (
      <>
        {breadcrumbs}
        <h1 className="brand-display mb-5 text-3xl font-semibold tracking-brand sm:text-4xl">
          Carpools
        </h1>
        <Card>
          <CardContent className="app-muted text-sm">
            This event doesn&apos;t organize carpools.{" "}
            {canManage && (
              <Link
                href={`/portal/events/${encodeURIComponent(event.id)}?tab=planning`}
                className="underline"
              >
                Turn on Organize carpools under Planning.
              </Link>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {breadcrumbs}
      <CarpoolBoard
        eventId={event.id}
        eventName={event.name}
        startsAt={event.starts_at}
        timezone={event.timezone}
        canManage={canManage}
        data={registrants.data}
      />
    </>
  );
}
