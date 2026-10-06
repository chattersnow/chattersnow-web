import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  registrantAnswersCsv,
  registrantAnswersCsvFilename,
  type AnswersCsvRegistration,
} from "../../../registrant-answers-csv";

/**
 * "Download answers (CSV)" on the registrants tab (#1501): one row per active
 * registration with its answers to the event's current questions, and contact
 * details only where the registration agreed to them being shared -- see
 * `registrant-answers-csv.ts`.
 *
 * A route handler rather than a Server Action because the result is a file,
 * as with the organization export. Gated on `events: manage` here, not just
 * by the tab hiding the link: the answers and the contact details are read at
 * `events: view` under RLS, and the file is for whoever arranges things with a
 * partner, not for the door. Cancelled registrations are left out, as the tab
 * keeps them out of its list.
 *
 * Rides, Ski level and Snowboard level are added for a reader who also holds
 * `rider_profiles: view`, the same gate the registrants list puts on its
 * Rides column -- and, through it, the rider_profile module.
 */
const REGISTRATION_COLUMNS =
  "name, email, phone, instagram_handle, party_size, answers:event_registration_answers(question_id, answer_text, value)";
const RIDER_COLUMNS =
  "riding_discipline_at_event, ski_experience_level_at_event, snowboard_experience_level_at_event, person:people(riding_discipline, ski_experience_level, snowboard_experience_level)";

type RegistrationRow = Omit<AnswersCsvRegistration, "rider"> & {
  riding_discipline_at_event?: string | null;
  ski_experience_level_at_event?: string | null;
  snowboard_experience_level_at_event?: string | null;
  person?: {
    riding_discipline: string | null;
    ski_experience_level: string | null;
    snowboard_experience_level: string | null;
  } | null;
};

function toCsvRow({
  riding_discipline_at_event,
  ski_experience_level_at_event,
  snowboard_experience_level_at_event,
  person,
  ...registration
}: RegistrationRow): AnswersCsvRegistration {
  return {
    ...registration,
    rider: {
      riding_discipline_at_event: riding_discipline_at_event ?? null,
      ski_experience_level_at_event: ski_experience_level_at_event ?? null,
      snowboard_experience_level_at_event:
        snowboard_experience_level_at_event ?? null,
      riding_discipline: person?.riding_discipline ?? null,
      ski_experience_level: person?.ski_experience_level ?? null,
      snowboard_experience_level: person?.snowboard_experience_level ?? null,
    },
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "events", "manage");
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: 403 });
  }

  const riders = hasPermission(
    await getCurrentUserPermissions(supabase),
    "rider_profiles",
    "view",
  );

  const [event, questions, registrations] = await Promise.all([
    supabase.from("events").select("name").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_registration_questions")
      .select("id, prompt, shares_contact")
      .eq("event_id", eventId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("event_registrations")
      .select(
        riders
          ? `${REGISTRATION_COLUMNS}, ${RIDER_COLUMNS}`
          : REGISTRATION_COLUMNS,
      )
      .eq("event_id", eventId)
      .is("cancelled_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (event.error || questions.error || registrations.error) {
    return NextResponse.json(
      { error: "Could not build the export. Please try again." },
      { status: 500 },
    );
  }
  if (!event.data) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const csv = registrantAnswersCsv(
    questions.data ?? [],
    ((registrations.data ?? []) as unknown as RegistrationRow[]).map(toCsvRow),
    { riders },
  );
  const filename = registrantAnswersCsvFilename(
    event.data.name,
    new Date().toISOString().slice(0, 10),
  );
  // The byte-order mark is what makes Excel read the file as UTF-8 rather
  // than mangling every accented name in it.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
