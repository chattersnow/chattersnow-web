// Integration test: listCalendarEvents, the read that puts portal Events on the
// portal Calendar (#530). Run against a real local Supabase stack because the
// interesting behaviour is RLS -- the calendar must not become a side door onto
// event titles and dates for a role that holds `content_calendar` but not
// `events` -- which a mocked client cannot show.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createProgram,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";
import { listCalendarEvents } from "./queries";

describe("listCalendarEvents (integration)", () => {
  test("shapes an event into calendar columns", async () => {
    const event = await createPublishedEvent({
      timezone: "America/Denver",
      endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    });

    const { events, error } = await listCalendarEvents(adminClient);

    expect(error).toBe(false);
    const found = events.find((row) => row.id === event.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe(event.name);
    expect(found!.time_zone).toBe("America/Denver");
    expect(found!.ends_at).not.toBeNull();
    expect(found!.status).toBe("published");
    expect(found!.visibility).toBe("public");
    expect(found!.program_ids).toEqual([]);

    await event.cleanup();
  });

  test("includes drafts and private events -- this is the internal calendar", async () => {
    const draft = await createPublishedEvent({
      status: "draft",
      visibility: "private",
    });

    const { events } = await listCalendarEvents(adminClient);
    expect(events.map((row) => row.id)).toContain(draft.id);

    await draft.cleanup();
  });

  test("leaves archived events off the calendar", async () => {
    const archived = await createPublishedEvent({ status: "archived" });

    const { events } = await listCalendarEvents(adminClient);
    expect(events.map((row) => row.id)).not.toContain(archived.id);

    await archived.cleanup();
  });

  test("filters by program, and carries the links through", async () => {
    const program = await createProgram();
    const linked = await createPublishedEvent();
    const unlinked = await createPublishedEvent();
    const { error: linkError } = await adminClient
      .from("event_programs")
      .insert({ event_id: linked.id, program_id: program.id });
    expect(linkError).toBeNull();

    const { events } = await listCalendarEvents(adminClient, {
      programId: program.id,
    });
    const ids = events.map((row) => row.id);
    expect(ids).toContain(linked.id);
    expect(ids).not.toContain(unlinked.id);
    expect(events.find((row) => row.id === linked.id)!.program_ids).toEqual([
      program.id,
    ]);

    await linked.cleanup();
    await unlinked.cleanup();
    await program.cleanup();
  });

  test("a content_calendar-only role sees no events through the calendar", async () => {
    // board holds content_calendar:view and events:none, so it reaches
    // /portal/calendar but must not read event rows from it.
    const event = await createPublishedEvent();

    const board = await signInAs(SEEDED_USERS.board);
    const { events, error } = await listCalendarEvents(board);

    expect(error).toBe(false);
    expect(events.map((row) => row.id)).not.toContain(event.id);

    await event.cleanup();
  });

  test("an events:view role sees them", async () => {
    const event = await createPublishedEvent();

    const finance = await signInAs(SEEDED_USERS.finance);
    const { events, error } = await listCalendarEvents(finance);

    expect(error).toBe(false);
    expect(events.map((row) => row.id)).toContain(event.id);

    await event.cleanup();
  });

  test("anon reads are refused outright, never partially answered", async () => {
    const { events, error } = await listCalendarEvents(anonClient());
    expect(error).toBe(true);
    expect(events).toEqual([]);
  });
});
