import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { ArtworkSubmissionForm } from "./artwork-submission-form";

type ArtworkCall = {
  call_id: string;
  event_id: string;
  event_name: string;
  starts_at: string;
  location: string | null;
  intro: string | null;
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

  const eventDate = new Date(call.starts_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="app-shell py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="app-eyebrow">Call for artwork</p>
        <h1 className="brand-display mt-2 text-3xl sm:text-4xl">
          {call.event_name}
        </h1>
        <div className="rainbow-accent mt-4 w-16" />
        <p className="app-muted mt-4">
          {eventDate}
          {call.location ? ` · ${call.location}` : ""}
        </p>

        {call.intro && (
          <div className="mt-6 whitespace-pre-line text-base leading-relaxed">
            {call.intro}
          </div>
        )}

        <div className="mt-10">
          <ArtworkSubmissionForm code={code} maxImages={call.max_images} />
        </div>
      </div>
    </div>
  );
}
