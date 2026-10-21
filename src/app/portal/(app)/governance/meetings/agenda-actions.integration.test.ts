// Integration test: exercises the real agenda Server Actions against a real
// local Supabase stack (checkUser/checkPermission, then real `agendas`,
// `agenda_templates` and `agenda_template_versions` RLS). The agenda is the
// one governance surface whose read actions split levels -- the agenda
// itself is gated at governance:manage, while the template list is gated at
// governance:view -- and the templates carry their own tables and policies,
// none of which any other integration test touches. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createGovernanceMeeting,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getAgendaAction, upsertAgendaAction, listActiveAgendaTemplatesAction } =
  await import("./agenda-actions");
const { startMinutesFromAgendaAction } = await import("./minutes-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function agendaForm(
  overrides: {
    newBusiness?: string[];
    templateId?: string;
    templateVersionId?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("externalLink", "https://example.test/agenda.pdf");
  fd.set("bodyText", "Standing board agenda.");
  fd.set(
    "ongoingItems",
    JSON.stringify({
      fundraising: { updates: "Winter drive on track", decisions_needed: "" },
    }),
  );
  fd.set(
    "newBusiness",
    JSON.stringify(overrides.newBusiness ?? ["Approve the gear budget"]),
  );
  fd.set("parkingLot", JSON.stringify(["Storage unit lease"]));
  fd.set(
    "upcomingDates",
    JSON.stringify([
      { date: "2026-04-01", description: "Gear drive", owner: "Board" },
    ]),
  );
  fd.set("nextMeetingDate", "2026-04-15");
  fd.set("nextMeetingTopics", "Budget review");
  if (overrides.templateId) fd.set("templateId", overrides.templateId);
  if (overrides.templateVersionId) {
    fd.set("templateVersionId", overrides.templateVersionId);
  }
  return fd;
}

async function agendaFor(meetingId: string) {
  const { data, error } = await adminClient
    .from("agendas")
    .select("id, meeting_id, body_text, new_business, next_meeting_topics")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedAgenda(meetingId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await upsertAgendaAction(meetingId, agendaForm());
  if ("error" in result) throw new Error(result.error);
}

describe("agenda actions (integration)", () => {
  test("requires a signed-in user to save an agenda", async () => {
    currentSupabase = anonClient();

    expect(await upsertAgendaAction(crypto.randomUUID(), agendaForm())).toEqual(
      { error: "You must be signed in to update the agenda." },
    );
    // The two read actions have no checkUser guard -- an anonymous client
    // holds no permissions, so they fall through to the permission check.
    expect(await getAgendaAction(crypto.randomUUID())).toEqual(DENIED);
    expect(await listActiveAgendaTemplatesAction()).toEqual(DENIED);
  });

  test("admin role (governance manage) can save, re-save and read an agenda", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await upsertAgendaAction(meeting.id, agendaForm())).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const loaded = await getAgendaAction(meeting.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data).toMatchObject({
      meeting_id: meeting.id,
      external_link: "https://example.test/agenda.pdf",
      new_business: ["Approve the gear budget"],
      parking_lot: ["Storage unit lease"],
      next_meeting_date: "2026-04-15",
      next_meeting_topics: "Budget review",
    });
    expect(loaded.data.ongoing_items.fundraising?.updates).toBe(
      "Winter drive on track",
    );

    // The second call takes the on-conflict update path, a separate RLS
    // policy from the insert one.
    expect(
      await upsertAgendaAction(
        meeting.id,
        agendaForm({
          newBusiness: ["Approve the gear budget", "Elect a chair"],
        }),
      ),
    ).toEqual({ success: true });
    expect(await agendaFor(meeting.id)).toMatchObject({
      new_business: ["Approve the gear budget", "Elect a chair"],
    });

    await meeting.cleanup();
  });

  test("returns null rather than an error for a meeting with no agenda yet", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await getAgendaAction(meeting.id)).toEqual({ data: null });

    await meeting.cleanup();
  });

  test("board role (governance manage) can pin an agenda to a seeded template version", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    const templates = await listActiveAgendaTemplatesAction();
    if (!("data" in templates)) throw new Error("expected data");
    expect(templates.data.length).toBeGreaterThan(0);

    const template = templates.data[0];
    expect(template.sections.length).toBeGreaterThan(0);

    expect(
      await upsertAgendaAction(
        meeting.id,
        agendaForm({
          templateId: template.id,
          templateVersionId: template.version_id,
        }),
      ),
    ).toEqual({ success: true });

    // getAgendaAction resolves the pinned version's sections through the
    // `agenda_template_versions` FK, which has its own select policy.
    const loaded = await getAgendaAction(meeting.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.template_id).toBe(template.id);
    expect(loaded.data.template_version_id).toBe(template.version_id);
    expect(loaded.data.template_sections).toEqual(template.sections);

    await meeting.cleanup();
  });

  test("rejects a malformed new business list, even for a permitted role", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const fd = agendaForm();
    fd.set("newBusiness", "not json");

    expect(await upsertAgendaAction(meeting.id, fd)).toEqual({
      error: "Could not read the new business list. Please try again.",
    });

    await meeting.cleanup();
  });

  async function expectNoAccess(email: string) {
    const meeting = await createGovernanceMeeting();
    await seedAgenda(meeting.id);
    currentSupabase = await signInAs(email);

    expect(await getAgendaAction(meeting.id)).toEqual(DENIED);
    expect(await listActiveAgendaTemplatesAction()).toEqual(DENIED);
    expect(
      await upsertAgendaAction(
        meeting.id,
        agendaForm({ newBusiness: ["Rewritten by an unauthorized role"] }),
      ),
    ).toEqual(DENIED);

    // The denied save must not have landed: the action refuses it, and the
    // `agendas update` policy would too.
    expect(await agendaFor(meeting.id)).toMatchObject({
      new_business: ["Approve the gear budget"],
    });

    await meeting.cleanup();
  }

  test("event_coordinator role can neither read nor save an agenda", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role can neither read nor save an agenda", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role can neither read nor save an agenda", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account can neither read nor save an agenda", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});

// A committee meeting's simple agenda (#1623): the shape is chosen on the
// server from the meeting's type, the columns hold it, and starting the
// minutes freezes one entry per item keyed to the item's id.
describe("simple agenda (integration)", () => {
  const LONG_TITLE =
    "Review the volunteer coordination plan for the winter gear swap, including shift coverage at both drop-off sites and the backup plan for snow days";
  const LONG_NOTES =
    "Last year we were short four volunteers on the Saturday morning shift and the line backed up for most of an hour. ".repeat(
      10,
    );
  const FIRST = crypto.randomUUID();
  const SECOND = crypto.randomUUID();

  function simpleForm(items: unknown) {
    const fd = new FormData();
    fd.set("externalLink", "https://example.test/committee.pdf");
    fd.set("items", JSON.stringify(items));
    return fd;
  }

  test("upserts and reads a simple agenda, then freezes it into the minutes", async () => {
    const meeting = await createGovernanceMeeting({ meetingType: "committee" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await upsertAgendaAction(
        meeting.id,
        simpleForm([
          { id: FIRST, title: LONG_TITLE, notes: LONG_NOTES },
          { id: SECOND, title: "Budget for the spring swap" },
        ]),
      ),
    ).toEqual({ success: true });

    const loaded = await getAgendaAction(meeting.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data).toMatchObject({
      format: "simple",
      external_link: "https://example.test/committee.pdf",
      template_id: null,
      items: [
        { id: FIRST, title: LONG_TITLE, notes: LONG_NOTES.trim() },
        { id: SECOND, title: "Budget for the spring swap" },
      ],
      ongoing_items: {},
      new_business: [],
    });

    // Reordered on the update path.
    expect(
      await upsertAgendaAction(
        meeting.id,
        simpleForm([
          { id: SECOND, title: "Budget for the spring swap" },
          { id: FIRST, title: LONG_TITLE, notes: LONG_NOTES },
        ]),
      ),
    ).toEqual({ success: true });

    const started = await startMinutesFromAgendaAction(meeting.id);
    if (!("success" in started)) throw new Error(started.error.message);
    expect(started.data.agenda_snapshot?.template_id).toBeNull();
    expect(started.data.agenda_snapshot?.items.map((item) => item.key)).toEqual(
      ["opening", `item:${SECOND}`, `item:${FIRST}`, "decisions"],
    );
    expect(started.data.agenda_snapshot?.items[2]).toMatchObject({
      label: LONG_TITLE,
      kind: "item",
      planned: { text: LONG_NOTES.trim() },
    });

    await meeting.cleanup();
  });

  test("an agenda in the other shape is kept, and refused rather than converted", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(await upsertAgendaAction(meeting.id, agendaForm())).toEqual({
      success: true,
    });

    const { error } = await adminClient
      .from("governance_meetings")
      .update({ meeting_type: "committee" })
      .eq("id", meeting.id);
    if (error) throw error;

    expect(
      await upsertAgendaAction(
        meeting.id,
        simpleForm([{ id: FIRST, title: "Volunteer plan" }]),
      ),
    ).toEqual({
      error:
        "This agenda was written for a different meeting type, so it can no longer be edited.",
    });
    expect(await agendaFor(meeting.id)).toMatchObject({
      new_business: ["Approve the gear budget"],
    });

    await meeting.cleanup();
  });

  test("the database refuses an unknown format and a non-array items column", async () => {
    const meeting = await createGovernanceMeeting({ meetingType: "committee" });

    const rows: Record<string, unknown>[] = [
      { meeting_id: meeting.id, format: "outline" },
      { meeting_id: meeting.id, format: "simple", items: { a: 1 } },
    ];
    for (const row of rows) {
      const { error } = await adminClient.from("agendas").insert(row);
      expect(error?.code).toBe("23514");
    }

    await meeting.cleanup();
  });
});
