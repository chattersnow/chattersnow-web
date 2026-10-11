// Integration test: the event retro (#1578) against a real local Supabase
// stack -- the retro Server Actions, and `event_retro_items` RLS underneath
// them, since the access rule (events:manage, or on the event's staff roster)
// is enforced in both places and only the database half can be trusted.
//
// The seeded `finance` role holds events:view but not events:manage, so it is
// the "staff member" here once its person is put on an event's roster;
// `volunteer` holds events:view too and is never on a roster.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createProgram,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createEventRetroItemAction,
  deleteEventRetroItemAction,
  getEventRetroAction,
  listCarriedForwardActionsAction,
  setEventRetroActionDoneAction,
  updateEventRetroItemAction,
} = await import("./retro-actions");

function retroForm(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

async function personIdFor(email: string) {
  const { data, error } = await adminClient
    .from("people")
    .select("id")
    .eq("email", email)
    .single();
  if (error) throw error;
  return data.id as string;
}

async function retro(eventId: string) {
  const result = await getEventRetroAction(eventId);
  if (!("data" in result)) throw new Error(result.error);
  return result.data;
}

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe("event retro (integration)", () => {
  let event: Awaited<ReturnType<typeof createPublishedEvent>>;
  let financePersonId: string;

  beforeAll(async () => {
    event = await createPublishedEvent({ startsAt: daysFromNow(-2) });
    financePersonId = await personIdFor(SEEDED_USERS.finance);
  });

  afterAll(async () => {
    await event.cleanup();
  });

  test("an events:view holder off the roster can read but not add", async () => {
    for (const email of [SEEDED_USERS.finance, SEEDED_USERS.volunteer]) {
      currentSupabase = await signInAs(email);
      expect((await retro(event.id)).canWrite).toBe(false);
      expect(
        await createEventRetroItemAction(
          event.id,
          retroForm({ kind: "improve", body: "Sign-in table" }),
        ),
      ).toEqual({
        error:
          "Only the event's staff and event managers can add to its retro.",
      });

      // And RLS refuses the same insert made directly.
      const { data: user } = await currentSupabase.auth.getUser();
      const { error } = await currentSupabase.from("event_retro_items").insert({
        event_id: event.id,
        kind: "improve",
        body: "Direct",
        author_id: user.user!.id,
      });
      expect(error).not.toBeNull();
    }
  });

  test("several authors add items; each changes only their own, managers any", async () => {
    // The coordinator writes with events:manage, rostered or not.
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    expect(
      await createEventRetroItemAction(
        event.id,
        retroForm({ kind: "went_well", body: "Ability groups", area: "team" }),
      ),
    ).toEqual({ success: true });

    // Finance writes once on the staff roster.
    const { data: staffRow, error: staffError } = await adminClient
      .from("event_staff")
      .insert({ event_id: event.id, person_id: financePersonId })
      .select("id")
      .single();
    if (staffError) throw staffError;

    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect((await retro(event.id)).canWrite).toBe(true);
    expect(
      await createEventRetroItemAction(
        event.id,
        retroForm({
          kind: "action",
          body: "Print the roster the night before",
          area: "operations",
          ownerPersonId: financePersonId,
        }),
      ),
    ).toEqual({ success: true });

    const view = await retro(event.id);
    expect(view.owners.map((person) => person.id)).toContain(financePersonId);
    const wentWell = view.items.find((item) => item.kind === "went_well")!;
    const action = view.items.find((item) => item.kind === "action")!;
    expect(action.status).toBe("open");
    expect(action.owner?.id).toBe(financePersonId);
    expect(action.author_name).toBeTruthy();
    expect(wentWell.author_name).toBeTruthy();

    // Finance may not touch the coordinator's item, by action or directly.
    expect(
      await updateEventRetroItemAction(
        wentWell.id,
        retroForm({ kind: "went_well", body: "Rewritten" }),
      ),
    ).toEqual({
      error: "Only the item's author or an event manager can change it.",
    });
    expect(await deleteEventRetroItemAction(wentWell.id)).toEqual({
      error: "Only the item's author or an event manager can change it.",
    });
    const { data: direct } = await currentSupabase
      .from("event_retro_items")
      .update({ body: "Rewritten" })
      .eq("id", wentWell.id)
      .select("id");
    expect(direct).toEqual([]);

    // ...but closes their own action item.
    expect(await setEventRetroActionDoneAction(action.id, true)).toEqual({
      success: true,
    });
    const closed = (await retro(event.id)).items.find(
      (item) => item.id === action.id,
    )!;
    expect(closed.status).toBe("done");
    expect(closed.completed_at).not.toBeNull();

    // The coordinator edits anyone's item.
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    expect(
      await updateEventRetroItemAction(
        action.id,
        retroForm({
          kind: "action",
          body: "Print the roster two nights before",
        }),
      ),
    ).toEqual({ success: true });
    const edited = (await retro(event.id)).items.find(
      (item) => item.id === action.id,
    )!;
    // Editing the words keeps the item done.
    expect(edited.status).toBe("done");
    expect(edited.owner).toBeNull();

    // Off the roster again, finance loses write access to its own item too.
    await adminClient.from("event_staff").delete().eq("id", staffRow.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(await deleteEventRetroItemAction(action.id)).toEqual({
      error: "Only the item's author or an event manager can change it.",
    });
  });

  test("a submitted report freezes the retro except for closing actions", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    await createEventRetroItemAction(
      event.id,
      retroForm({ kind: "action", body: "Book the van" }),
    );
    const action = (await retro(event.id)).items.find(
      (item) => item.body === "Book the van",
    )!;

    await adminClient
      .from("events")
      .update({ report_status: "submitted" })
      .eq("id", event.id);
    try {
      expect((await retro(event.id)).locked).toBe(true);
      const locked = {
        error:
          "This event's report has been submitted. Reopen it to change the retro.",
      };
      expect(
        await createEventRetroItemAction(
          event.id,
          retroForm({ kind: "improve", body: "Late" }),
        ),
      ).toEqual(locked);
      expect(await deleteEventRetroItemAction(action.id)).toEqual(locked);
      expect(await setEventRetroActionDoneAction(action.id, true)).toEqual({
        success: true,
      });
    } finally {
      await adminClient
        .from("events")
        .update({ report_status: "not_started" })
        .eq("id", event.id);
    }
  });

  test("text written to lessons_learned is archived as an improve item", async () => {
    await adminClient
      .from("events")
      .update({ lessons_learned: "Two greeters at the door next time" })
      .eq("id", event.id);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const archived = (await retro(event.id)).items.find(
      (item) => item.body === "Two greeters at the door next time",
    );
    expect(archived?.kind).toBe("improve");
    expect(archived?.author_id).toBeNull();
  });
});

describe("carry-forward within a program (integration)", () => {
  test("open action items from earlier same-program events surface on later ones", async () => {
    const program = await createProgram();
    const earlier = await createPublishedEvent({ startsAt: daysFromNow(-30) });
    const later = await createPublishedEvent({ startsAt: daysFromNow(10) });
    const unrelated = await createPublishedEvent({ startsAt: daysFromNow(20) });
    try {
      const { error } = await adminClient.from("event_programs").insert([
        { event_id: earlier.id, program_id: program.id },
        { event_id: later.id, program_id: program.id },
      ]);
      if (error) throw error;

      currentSupabase = await signInAs(SEEDED_USERS.coordinator);
      for (const body of ["Open follow-up", "Closed follow-up"]) {
        await createEventRetroItemAction(
          earlier.id,
          retroForm({ kind: "action", body }),
        );
      }
      await createEventRetroItemAction(
        earlier.id,
        retroForm({ kind: "improve", body: "Not an action" }),
      );
      await createEventRetroItemAction(
        later.id,
        retroForm({ kind: "action", body: "Later event's own" }),
      );
      const closed = (await retro(earlier.id)).items.find(
        (item) => item.body === "Closed follow-up",
      )!;
      await setEventRetroActionDoneAction(closed.id, true);

      const carried = async (eventId: string) => {
        const result = await listCarriedForwardActionsAction(eventId);
        if (!("data" in result)) throw new Error(result.error);
        return result.data.items.map((item) => item.body);
      };

      expect(await carried(later.id)).toEqual(["Open follow-up"]);
      // Nothing flows backwards, and an event in no program gets nothing.
      expect(await carried(earlier.id)).toEqual([]);
      expect(await carried(unrelated.id)).toEqual([]);

      // Board holds no events:view, so it reads no retro at all.
      currentSupabase = await signInAs(SEEDED_USERS.board);
      expect(await listCarriedForwardActionsAction(later.id)).toEqual({
        error: "You don't have permission to perform this action.",
      });
    } finally {
      await adminClient
        .from("event_programs")
        .delete()
        .in("event_id", [earlier.id, later.id]);
      await earlier.cleanup();
      await later.cleanup();
      await unrelated.cleanup();
      await program.cleanup();
    }
  });
});
