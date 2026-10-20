// Integration test (#1624): a committee meeting's agenda pre-filled from its
// linked event's open work, through the real actions and the real `events`,
// `event_checklist_items` and `agendas` RLS. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createGovernanceMeeting,
  createPublishedEvent,
  signIn,
} from "../../../../../../test/integration-setup";
import type { AgendaItem } from "./agenda-form";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { prefillAgendaFromEventAction, refreshAgendaFromEventAction } =
  await import("./agenda-prefill-actions");

async function agendaItems(meetingId: string): Promise<AgendaItem[] | null> {
  const { data, error } = await adminClient
    .from("agendas")
    .select("items")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.items as AgendaItem[]) : null;
}

async function linkEvent(meetingId: string, eventId: string | null) {
  const { error } = await adminClient
    .from("governance_meetings")
    .update({ event_id: eventId })
    .eq("id", meetingId);
  if (error) throw error;
}

async function addChecklistItem(eventId: string, title: string) {
  const { data, error } = await adminClient
    .from("event_checklist_items")
    .insert({ event_id: eventId, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("agenda pre-filled from the linked event (integration)", () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  let eventId: string;

  beforeAll(async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    // Started yesterday with nothing logged: attendance, the after-report and
    // the retro are all open, plus one checklist item.
    const event = await createPublishedEvent({
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    eventId = event.id;
    cleanups.push(async () => {
      await adminClient
        .from("event_checklist_items")
        .delete()
        .eq("event_id", eventId);
      await event.cleanup();
    });
    await addChecklistItem(eventId, "Return the folding tables");
  });

  afterAll(async () => {
    // Meetings first: their event link would otherwise outlive the event.
    for (const cleanup of cleanups.reverse()) await cleanup();
  });

  async function meeting(meetingType: string, linked: boolean) {
    const created = await createGovernanceMeeting({ meetingType });
    cleanups.push(created.cleanup);
    if (linked) await linkEvent(created.id, eventId);
    return created.id;
  }

  test("a committee meeting with a linked event is pre-filled once", async () => {
    const id = await meeting("committee", true);

    expect(await prefillAgendaFromEventAction(id)).toEqual({ added: 4 });
    const items = await agendaItems(id);
    expect(items!.map((item) => item.title)).toEqual([
      "Attendance not logged",
      "After-report not started",
      "Retro not started",
      "Return the folding tables",
    ]);
    expect(items![0]!.source).toMatchObject({ kind: "event", id: eventId });

    // Emptied on purpose: opening it again must not fill it back in.
    await adminClient
      .from("agendas")
      .update({ items: [] })
      .eq("meeting_id", id);
    expect(await prefillAgendaFromEventAction(id)).toEqual({ added: 0 });
    expect(await agendaItems(id)).toEqual([]);
  });

  test("a board meeting and an unlinked committee meeting are not", async () => {
    const board = await meeting("board", true);
    const unlinked = await meeting("committee", false);

    for (const id of [board, unlinked]) {
      expect(await prefillAgendaFromEventAction(id)).toEqual({ added: 0 });
      expect(await agendaItems(id)).toBeNull();
      expect(await refreshAgendaFromEventAction(id)).toEqual({
        error:
          "Only a committee meeting linked to an event can be filled from it.",
      });
    }
  });

  test("refresh adds only new work and keeps what the committee changed", async () => {
    const id = await meeting("committee", true);
    await prefillAgendaFromEventAction(id);
    const [first, ...rest] = (await agendaItems(id))!;
    // Renamed, and one removed, plus an item the committee typed itself.
    const edited: AgendaItem[] = [
      { ...first!, title: "Who logs the headcount?" },
      ...rest.slice(0, -1),
      { id: "own-item", title: "Budget for next year" },
    ];
    await adminClient
      .from("agendas")
      .update({ items: edited })
      .eq("meeting_id", id);
    const checklistId = await addChecklistItem(eventId, "Thank the venue");

    try {
      expect(await refreshAgendaFromEventAction(id)).toEqual({ added: 2 });
      const items = (await agendaItems(id))!;
      expect(items.slice(0, edited.length)).toEqual(edited);
      expect(items.slice(edited.length).map((item) => item.title)).toEqual([
        "Return the folding tables",
        "Thank the venue",
      ]);

      expect(await refreshAgendaFromEventAction(id)).toEqual({ added: 0 });
    } finally {
      await adminClient
        .from("event_checklist_items")
        .delete()
        .eq("id", checklistId);
    }
  });

  test("a viewer without governance manage is refused", async () => {
    const id = await meeting("committee", true);
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    try {
      expect(await prefillAgendaFromEventAction(id)).toEqual({
        error: "You don't have permission to perform this action.",
      });
    } finally {
      currentSupabase = await signIn(SEEDED_USERS.admin);
    }
    expect(await agendaItems(id)).toBeNull();
  });
});
