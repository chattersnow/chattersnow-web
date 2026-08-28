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
