import { ApiError } from "@/lib/api/errors";
import { publicRead, unwrap } from "@/lib/api/handler";

/** One published event. A draft, a private one, or another tenant's is a 404. */
const route = publicRead<{ tenant: string; event: string }>(
  async ({ supabase, params }) => {
    const event = unwrap(
      await supabase
        .from("public_events")
        .select(
          "id, name, location, starts_at, ends_at, timezone, description, capacity, registration_enabled, registration_deadline, flier_url",
        )
        .eq("id", params.event)
        .maybeSingle(),
    );

    if (!event) throw new ApiError("not_found", "No such published event.");

    const [sponsors, programs] = await Promise.all([
      supabase
        .from("public_event_sponsors")
        .select("sponsor_id, name, logo_url, website")
        .eq("event_id", params.event),
      supabase
        .from("public_event_programs")
        .select("program_id, name")
        .eq("event_id", params.event),
    ]);

    return {
      event: {
        ...event,
        sponsors: unwrap(sponsors) ?? [],
        programs: unwrap(programs) ?? [],
      },
    };
  },
);

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
