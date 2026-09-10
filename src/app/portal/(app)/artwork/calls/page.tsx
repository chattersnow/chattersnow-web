import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/portal/empty-state";
import { LinkPendingPulse } from "@/components/link-pending";
import { formatDateTimeInZone } from "@/lib/time";
import { ArtworkCallStatusBadge } from "../submission-badges";
import type { ArtworkCall } from "../submission-types";
import { ArtworkCallDialog } from "./call-dialog";
import { ShareLink } from "./share-link";

export const metadata: Metadata = {
  title: "Calls for Artwork",
};

type EventOption = { id: string; name: string; starts_at: string };

export default async function ArtworkCallsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "artwork_submissions", "manage");

  const { data, error } = await supabase
    .from("event_artwork_calls")
    .select(
      "id, title, timezone, event_id, submission_code, is_open, opens_at, closes_at, intro, rights_note, max_images, event:events(id, name, starts_at, timezone), submissions:artwork_submissions(count)",
    )
    .order("created_at", { ascending: false });

  const calls: ArtworkCall[] = (data ?? []).map((row) => {
    const record = row as ArtworkCall & {
      event: ArtworkCall["event"] | ArtworkCall["event"][];
      submissions: { count: number }[] | null;
    };
    return {
      ...record,
      event: Array.isArray(record.event)
        ? (record.event[0] ?? null)
        : record.event,
      submission_count: record.submissions?.[0]?.count ?? 0,
    };
  });

  // Only events that have no call yet can take a new one -- the table's
  // `unique (tenant_id, event_id)` would refuse the rest, and offering them in
  // the picker would turn a rule into a surprise. Standalone calls contribute a
  // null and are filtered out: they claim no event, and leaving nulls in would
  // only make the Set's type a lie.
  const claimed = new Set(
    calls.map((call) => call.event_id).filter((id) => id !== null),
  );
  const { data: eventRows } = await supabase
    .from("events")
    .select("id, name, starts_at")
    .order("starts_at", { ascending: false })
    .limit(100);
  const eventOptions = ((eventRows ?? []) as EventOption[]).filter(
    (event) => !claimed.has(event.id),
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Calls for artwork
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Each call has its own link. It is the only way in — the page is not in
        the site&apos;s navigation and it is not indexed — so share it wherever
        you are asking for work.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/portal/artwork" />}
          >
            <LinkPendingPulse>Submissions</LinkPendingPulse>
          </Button>
          {canManage && <ArtworkCallDialog events={eventOptions} />}
        </div>

        {error ? (
          <p className="app-muted px-4 py-6 text-sm">
            Could not load calls for artwork. Please try again.
          </p>
        ) : calls.length === 0 ? (
          <Card>
            <CardContent className="px-0">
              <EmptyState
                title="No calls yet"
                description="Open a call to start collecting community artwork. It can stand on its own, or hang off an event."
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {calls.map((call) => (
              <li key={call.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium">{call.title}</h2>
                      <ArtworkCallStatusBadge isOpen={call.is_open} />
                    </div>
                    {/* The event is context now rather than identity, so it
                        sits under the title and disappears when there isn't
                        one, instead of a placeholder standing in for it. */}
                    {call.event && (
                      <p className="app-muted text-sm">For {call.event.name}</p>
                    )}
                    <p className="app-muted text-sm">
                      {call.submission_count === 1
                        ? "1 submission"
                        : `${call.submission_count} submissions`}
                      {" · "}
                      {call.max_images} image
                      {call.max_images === 1 ? "" : "s"} per artist
                      {/* In the call's own zone, resolved the same way the
                          public page resolves it. formatInstantDate would use
                          the server's, so a curator and the artist they are
                          waiting on could read different days off the same
                          deadline. */}
                      {call.closes_at
                        ? ` · closes ${formatDateTimeInZone(
                            call.closes_at,
                            call.timezone ?? call.event?.timezone ?? "UTC",
                            { dateStyle: "medium" },
                            "en-US",
                          )}`
                        : ""}
                    </p>
                    <ShareLink code={call.submission_code} />
                    {canManage && (
                      <div>
                        <ArtworkCallDialog call={call} events={[]} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
