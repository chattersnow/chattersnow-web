import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
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
 */
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
        "name, email, phone, instagram_handle, party_size, answers:event_registration_answers(question_id, answer_text, value)",
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
    (registrations.data ?? []) as AnswersCsvRegistration[],
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
