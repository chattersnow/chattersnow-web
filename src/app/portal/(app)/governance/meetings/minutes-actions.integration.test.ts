// Integration test: the minutes Server Actions against a real local Supabase
// stack (#1199). Three of the things this feature rests on cannot be checked
// anywhere else, because none of them is TypeScript:
//
//   * `save_meeting_minutes_draft()` MERGES the notes object rather than
//     replacing it -- the whole reason the RPC exists instead of an .update();
//   * `meeting_minutes_reject_final_edit()` refuses a content edit to a final
//     row while still allowing the reopen that unlocks it, which a
//     `using (status = 'draft')` update policy could not; and
//   * the select policy admits `governance:view` while the write policies do
//     not, so a read-only board member can read minutes and not touch them.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionFailure } from "@/lib/portal/action-result";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createGovernanceMeeting,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  finalizeMinutesAction,
  getMinutesAction,
  reopenMinutesAction,
  saveMinutesDraftAction,
  startMinutesFromAgendaAction,
} = await import("./minutes-actions");

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const FORBIDDEN: ActionFailure = {
  error: {
    code: "forbidden",
    message: "You don't have permission to perform this action.",
  },
};

afterEach(() => {
  revalidatePathMock.mockClear();
});

async function minutesRowFor(meetingId: string) {
  const { data, error } = await service
    .from("meeting_minutes")
    .select("id, notes, body_text, status, finalized_at, finalized_by")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** A meeting with the seeded board agenda pinned to it, cleaned up by the caller. */
async function meetingWithAgenda() {
  const meeting = await createGovernanceMeeting();

  const { data: template, error: templateError } = await adminClient
    .from("agenda_templates")
    .select("id, current_version_id")
    .eq("key", "board_meeting")
    .single();
  if (templateError) throw templateError;

  const { error } = await adminClient.from("agendas").insert({
    meeting_id: meeting.id,
    external_link: "https://example.test/agenda.pdf",
    body_text: "Notes taken on the agenda before the minutes existed.",
    template_id: template.id,
    template_version_id: template.current_version_id,
    ongoing_items: {
      finance_fundraising: {
        updates: "Winter drive on track.",
        decisions_needed: "Approve the gear budget.",
      },
    },
    new_business: ["Q1 grant applications"],
    parking_lot: ["Storage unit lease"],
    upcoming_dates: [
      { date: "2026-04-01", description: "Gear drive", owner: "Board" },
    ],
    next_meeting_date: "2026-04-15",
    next_meeting_topics: "Budget review",
  });
  if (error) throw error;

  return meeting;
}

describe("minutes actions (integration)", () => {
  test("a signed-out caller is refused every path", async () => {
    currentSupabase = anonClient();
    const meetingId = crypto.randomUUID();

    expect(await startMinutesFromAgendaAction(meetingId)).toEqual({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to start minutes.",
      },
    });
    expect(await saveMinutesDraftAction(meetingId, { notes: {} })).toEqual({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to save minutes.",
      },
    });
    // The read has no checkUser guard: an anonymous client holds no
    // permissions, so it falls through to the permission check.
    expect(await getMinutesAction(meetingId)).toEqual(FORBIDDEN);
  });

  test("starting freezes the agenda, and starting again is a conflict", async () => {
    const meeting = await meetingWithAgenda();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    try {
      const started = await startMinutesFromAgendaAction(meeting.id);
      if ("error" in started) throw new Error(started.error.message);

      expect(started.data.status).toBe("draft");
      // The agenda's free-text notes become the minutes' closing notes rather
      // than being left behind on the agenda.
      expect(started.data.body_text).toBe(
        "Notes taken on the agenda before the minutes existed.",
      );
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/portal/governance/meetings",
      );

      const snapshot = started.data.agenda_snapshot;
      expect(snapshot).not.toBeNull();
      expect(snapshot!.external_link).toBe("https://example.test/agenda.pdf");
      const keys = snapshot!.items.map((item) => item.key);
      expect(keys[0]).toBe("opening");
      expect(keys).toContain("section:finance_fundraising");
      expect(keys).toContain("section:technology_website");
      expect(keys).toContain("new_business:0");
      expect(
        snapshot!.items.find(
          (item) => item.key === "section:finance_fundraising",
        )?.planned,
      ).toMatchObject({
        updates: "Winter drive on track.",
        decisions_needed: "Approve the gear budget.",
      });

      // Editing the agenda afterwards does not move the frozen list.
      await adminClient
        .from("agendas")
        .update({ new_business: ["Something else entirely", "And another"] })
        .eq("meeting_id", meeting.id);
      const reread = await getMinutesAction(meeting.id);
      if (!("data" in reread) || !reread.data) throw new Error("expected data");
      expect(
        reread.data
          .agenda_snapshot!.items.filter((item) => item.kind === "new_business")
          .map((item) => item.label),
      ).toEqual(["Q1 grant applications"]);

      expect(await startMinutesFromAgendaAction(meeting.id)).toEqual({
        error: {
          code: "conflict",
          message: "Minutes have already been started for this meeting.",
        },
      });
    } finally {
      await meeting.cleanup();
    }
  });

  test("a meeting with no agenda still gets the active template's structure", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    try {
      const started = await startMinutesFromAgendaAction(meeting.id);
      if ("error" in started) throw new Error(started.error.message);

      expect(started.data.body_text).toBeNull();
      expect(
        started.data.agenda_snapshot!.items.map((item) => item.key),
      ).toContain("section:finance_fundraising");
    } finally {
      await meeting.cleanup();
    }
  });

  test("the RPC merges the notes object rather than replacing it", async () => {
    const meeting = await meetingWithAgenda();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    try {
      await startMinutesFromAgendaAction(meeting.id);
      // Starting does revalidate; the assertion below is about the saves.
      revalidatePathMock.mockClear();

      const first = await saveMinutesDraftAction(meeting.id, {
        notes: { opening: "Quorum met." },
      });
      if ("error" in first) throw new Error(first.error.message);
      expect(Number.isNaN(Date.parse(first.savedAt))).toBe(false);

      const second = await saveMinutesDraftAction(meeting.id, {
        notes: { "section:events": "Swap is on." },
      });
      if ("error" in second) throw new Error(second.error.message);

      // The second save named one key and left the other alone. A
      // read-modify-write would have dropped `opening` here.
      expect((await minutesRowFor(meeting.id))?.notes).toEqual({
        opening: "Quorum met.",
        "section:events": "Swap is on.",
      });

      // ...and the same key written twice is last-write-wins, by design.
      await saveMinutesDraftAction(meeting.id, {
        notes: { opening: "Quorum met at 18:04." },
      });
      expect((await minutesRowFor(meeting.id))?.notes).toEqual({
        opening: "Quorum met at 18:04.",
        "section:events": "Swap is on.",
      });

      // An autosave carrying no bodyText must not clear the closing notes.
      expect((await minutesRowFor(meeting.id))?.body_text).toBe(
        "Notes taken on the agenda before the minutes existed.",
      );
      await saveMinutesDraftAction(meeting.id, { bodyText: "" });
      expect((await minutesRowFor(meeting.id))?.body_text).toBe("");

      // A save is not a page revalidation: it is a debounced autosave.
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await meeting.cleanup();
    }
  });

  test("finalized minutes are read-only until reopened", async () => {
    const meeting = await meetingWithAgenda();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    try {
      await startMinutesFromAgendaAction(meeting.id);
      await saveMinutesDraftAction(meeting.id, { notes: { opening: "Held." } });

      expect(await finalizeMinutesAction(meeting.id)).toEqual({
        success: true,
      });
      const finalized = await minutesRowFor(meeting.id);
      expect(finalized?.status).toBe("final");
      expect(finalized?.finalized_at).not.toBeNull();
      expect(finalized?.finalized_by).not.toBeNull();

      // The RPC's `status = 'draft'` predicate matches nothing now.
      expect(
        await saveMinutesDraftAction(meeting.id, { notes: { opening: "No." } }),
      ).toEqual({
        error: {
          code: "conflict",
          message: "These minutes are final — reopen them to make changes.",
        },
      });

      // And the trigger refuses a content write that goes around the RPC.
      const direct = await adminClient
        .from("meeting_minutes")
        .update({ body_text: "Sneaking an edit in." })
        .eq("meeting_id", meeting.id)
        .select("id");
      expect(direct.error?.message).toContain("MINUTES_FINAL");

      // Finalizing twice is a conflict, not a silent no-op.
      expect(await finalizeMinutesAction(meeting.id)).toEqual({
        error: {
          code: "conflict",
          message: "There are no draft minutes to finalize for this meeting.",
        },
      });

      // The reopen is the one write a final row takes -- which is why the
      // guard is a trigger and not a policy predicate.
      expect(await reopenMinutesAction(meeting.id)).toEqual({ success: true });
      const reopened = await minutesRowFor(meeting.id);
      expect(reopened?.status).toBe("draft");
      expect(reopened?.finalized_at).toBeNull();
      expect(reopened?.finalized_by).toBeNull();
      expect(reopened?.notes).toEqual({ opening: "Held." });

      expect(await reopenMinutesAction(meeting.id)).toEqual({
        error: {
          code: "conflict",
          message: "There are no finalized minutes to reopen for this meeting.",
        },
      });

      // Writable again.
      expect(
        await saveMinutesDraftAction(meeting.id, {
          notes: { opening: "Held, with a correction." },
        }),
      ).toMatchObject({ success: true });
    } finally {
      await meeting.cleanup();
    }
  });

  test("saving to minutes that were never started is a conflict", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    try {
      expect(
        await saveMinutesDraftAction(meeting.id, { notes: { opening: "x" } }),
      ).toMatchObject({ error: { code: "conflict" } });
    } finally {
      await meeting.cleanup();
    }
  });

  test("refuses notes that are not a flat record of strings", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await saveMinutesDraftAction(crypto.randomUUID(), {
        notes: { opening: { text: "nested" } },
      }),
    ).toEqual({
      error: {
        code: "invalid_input",
        message: "Could not read the meeting notes. Please try again.",
        fields: {
          notes: "Could not read the meeting notes. Please try again.",
        },
      },
    });
  });

  test("a governance:view reader can read the minutes but not write them", async () => {
    // No seeded role holds governance at `view` -- admin and board both hold
    // manage and the rest hold none -- so the tier the select policy admits is
    // built here rather than assumed.
    const meeting = await meetingWithAgenda();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await startMinutesFromAgendaAction(meeting.id);

    const email = uniqueEmail("governance-view");
    const { data: created, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select("id")
      .eq("status", "active")
      .single();
    if (tenantError) throw tenantError;

    const { data: role, error: roleError } = await service
      .from("roles")
      .insert({
        tenant_id: tenant.id,
        name: `governance_viewer_${run}`,
        description: "view-only governance, for the integration suite",
      })
      .select("id")
      .single();
    if (roleError) throw roleError;

    const { data: resource } = await service
      .from("resources")
      .select("id")
      .eq("key", "governance")
      .single();
    await service
      .from("role_permissions")
      .insert({ role_id: role.id, resource_id: resource!.id, level: "view" });
    await service
      .from("user_roles")
      .insert({ user_id: created.user.id, role_id: role.id });

    try {
      const viewer = await signInAs(email);
      currentSupabase = viewer;

      const read = await getMinutesAction(meeting.id);
      expect("data" in read && read.data?.meeting_id).toBe(meeting.id);

      expect(await startMinutesFromAgendaAction(meeting.id)).toEqual(FORBIDDEN);
      expect(
        await saveMinutesDraftAction(meeting.id, { notes: { opening: "x" } }),
      ).toEqual(FORBIDDEN);
      expect(await finalizeMinutesAction(meeting.id)).toEqual(FORBIDDEN);
      expect(await reopenMinutesAction(meeting.id)).toEqual(FORBIDDEN);

      // ...and the policies behind them, not just the guards in front.
      const write = await viewer
        .from("meeting_minutes")
        .update({ body_text: "not allowed" })
        .eq("meeting_id", meeting.id)
        .select("id");
      expect(write.error).toBeNull();
      expect(write.data).toEqual([]);
    } finally {
      // role_permissions and user_roles cascade from the role.
      await service.from("roles").delete().eq("id", role.id);
      await service
        .from("tenant_memberships")
        .delete()
        .eq("user_id", created.user.id);
      await service
        .from("audit_log")
        .update({ actor_id: null })
        .eq("actor_id", created.user.id);
      await service.auth.admin.deleteUser(created.user.id);
      await meeting.cleanup();
    }
  });
});

// Last in the file on purpose: while a second active tenant exists,
// default_tenant_id() resolves to null and every unscoped insert in the suite
// stops cold.
describe("another tenant's minutes (integration)", () => {
  let tenantBId: string;
  let tenantBUserId: string;
  let meeting: Awaited<ReturnType<typeof createGovernanceMeeting>>;
  const tenantBEmail = uniqueEmail("minutes-tenant-b");

  beforeAll(async () => {
    meeting = await meetingWithAgenda();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const started = await startMinutesFromAgendaAction(meeting.id);
    if ("error" in started) throw new Error(started.error.message);

    const { data: tenant, error } = await service
      .from("tenants")
      .insert({
        name: `Minutes Isolation ${run}`,
        slug: `minutes-isolation-${run}`,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw error;
    tenantBId = tenant.id as string;

    const { data: role, error: roleError } = await service
      .from("roles")
      .insert({ tenant_id: tenantBId, name: "admin", description: "test" })
      .select("id")
      .single();
    if (roleError) throw roleError;

    const { data: resource } = await service
      .from("resources")
      .select("id")
      .eq("key", "governance")
      .single();
    await service
      .from("role_permissions")
      .insert({ role_id: role.id, resource_id: resource!.id, level: "manage" });

    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email: tenantBEmail,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    tenantBUserId = user.user.id;

    await service
      .from("user_roles")
      .insert({ user_id: tenantBUserId, role_id: role.id });
  });

  afterAll(async () => {
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", tenantBId);
    await service.from("roles").delete().eq("tenant_id", tenantBId);
    await service
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", tenantBId);
    await service
      .from("audit_log")
      .update({ actor_id: null })
      .eq("actor_id", tenantBUserId);
    await service.auth.admin.deleteUser(tenantBUserId);
    const { error } = await service
      .from("tenants")
      .delete()
      .eq("id", tenantBId);
    if (error) throw error;
    await meeting.cleanup();
  });

  test("tenant B's governance manager cannot read or write tenant A's minutes", async () => {
    currentSupabase = await signInAs(tenantBEmail);

    expect(await getMinutesAction(meeting.id)).toEqual({ data: null });
    // The same answer a made-up meeting id gets, so nothing leaks by existence.
    expect(await startMinutesFromAgendaAction(meeting.id)).toEqual({
      error: { code: "conflict", message: "That meeting no longer exists." },
    });
    expect(
      await saveMinutesDraftAction(meeting.id, { notes: { opening: "x" } }),
    ).toMatchObject({ error: { code: "conflict" } });
    expect(await finalizeMinutesAction(meeting.id)).toMatchObject({
      error: { code: "conflict" },
    });
  });
});
