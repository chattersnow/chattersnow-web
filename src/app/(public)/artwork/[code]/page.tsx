import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { formatDateTimeInZone } from "@/lib/time";
import { ArtworkSubmissionForm } from "./artwork-submission-form";
import { CallBrief } from "./call-brief";

type ArtworkCall = {
  call_id: string;
  title: string;
  /** Null on a call that stands on its own (#879); the four fields below it
   * are null with it, and the page renders the call's own deadline instead of
   * an event line. */
  event_id: string | null;
  event_name: string | null;
  starts_at: string | null;
  /** The call's own zone, else the event's, else UTC -- resolved in the RPC so
   * this is never null and never has to be guessed at here. */
  display_timezone: string;
  location: string | null;
  intro: string | null;
  rights_note: string | null;
  closes_at: string | null;
  max_images: number;
};

// Link-only, so it must never be indexed or surfaced from search: the code is
// the whole access control, and a crawled page hands it to everyone.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ArtworkSubmissionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createSupabaseServerClient();
  const ipAddress = await getClientIp();

  const { data, error } = await supabase
    .rpc("get_artwork_call", { p_code: code, p_ip_address: ipAddress })
    .maybeSingle();

  // A closed call, an unknown code and a tripped rate limit all render the same
  // 404. The code is the only thing guarding this page, so the response must
  // not distinguish "wrong" from "not open yet" for someone working through
  // guesses.
  if (error || !data) notFound();
  const call = data as ArtworkCall;

  // In the event's own zone, not the rendering environment's. This runs in a
  // Server Component, so the toLocaleDateString() it replaces was resolving
  // against whatever zone the serverless region happened to be in.
  const eventLine = call.starts_at
    ? formatDateTimeInZone(
        call.starts_at,
        call.display_timezone,
        { dateStyle: "long" },
        "en-US",
      ) + (call.location ? ` · ${call.location}` : "")
    : null;

  return (
    // px matching the layout's own header and footer. `app-shell` carries no
    // horizontal padding and (public)/layout.tsx pads only its chrome, so
    // without this the page runs edge to edge on anything narrower than
    // max-w-2xl -- which is every phone, and this call is shared by link.
    <div className="app-shell px-6 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="app-eyebrow">Call for artwork</p>
        {/*
          The call's own title, not the event's name (#879). Someone arriving
          from a flyer used to read this page as an event page, with the thing
          it was actually asking of them in quiet eyebrow text above.
        */}
        <h1 className="brand-display mt-2 text-3xl sm:text-4xl">
          {call.title}
        </h1>
        <div className="rainbow-accent mt-4 w-16" />
        {/* Absent entirely on a standalone call: the brief below carries the
            deadline, which is the date that matters to a submitter anyway. */}
        {eventLine && <p className="app-muted mt-4">{eventLine}</p>}

        {call.intro && (
          <div className="mt-6 whitespace-pre-line text-base leading-relaxed">
            {call.intro}
          </div>
        )}

        <div className="mt-8">
          <CallBrief
            closesAt={call.closes_at}
            timeZone={call.display_timezone}
            maxImages={call.max_images}
            rightsNote={call.rights_note}
          />
        </div>

        <div className="mt-10">
          <ArtworkSubmissionForm
            code={code}
            maxImages={call.max_images}
            rightsNote={call.rights_note}
          />
        </div>
      </div>
    </div>
  );
}
