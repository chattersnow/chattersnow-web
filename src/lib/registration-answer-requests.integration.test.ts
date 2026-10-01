// Integration test for asking registrants for missing answers by emailed link
// (#1502), against the real RPCs on a local Supabase stack: staff writing
// links, the anonymous page and save behind one, and every way a link stops
// working looking the same. A link from another tenant is asserted in the
// isolation suite, which owns a second tenant.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, describe, expect, test } from "bun:test";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  SEEDED_USERS,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);
const cleanups: (() => Promise<void>)[] = [];

const DAY = 24 * 60 * 60 * 1000;

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

type LinkPage = {
  event_id: string;
  event_name: string;
  first_name: string | null;
  expires_at: string;
  questions: { question_id: string; value: unknown; required: boolean }[];
};

/** An event asking one required choice and one optional text question. */
async function eventWithQuestions(
  overrides?: Parameters<typeof createPublishedEvent>[0],
) {
  const fixture = await createPublishedEvent({
    name: `Answer links ${run}`,
    ...overrides,
  });
  cleanups.push(fixture.cleanup);
  const ids = {
    gettingThere: crypto.randomUUID(),
    ride: crypto.randomUUID(),
    drive: crypto.randomUUID(),
    leavingFrom: crypto.randomUUID(),
  };
  const { error } = await adminClient.rpc("save_event_registration_questions", {
    p_event_id: fixture.id,
    p_questions: [
      {
        id: ids.gettingThere,
        kind: "single_choice",
        prompt: "Getting there",
        required: true,
        options: [
          { id: ids.ride, label: "Need a ride" },
          { id: ids.drive, label: "Driving" },
        ],
      },
      { id: ids.leavingFrom, kind: "short_text", prompt: "Leaving from" },
    ],
  });
  if (error) throw error;
  return { eventId: fixture.id, name: fixture.name, ...ids };
}

async function registration(eventId: string, name = "Robin Example") {
  const email = uniqueEmail("answer-link");
  const { data, error } = await service
    .from("event_registrations")
    .insert({ event_id: eventId, name, email, party_size: 2 })
    .select("id, tenant_id")
    .single();
  if (error) throw error;
  return { id: data.id as string, email };
}

async function ask(eventId: string, registrationId: string) {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await adminClient.rpc(
    "request_registration_answers",
    {
      p_event_id: eventId,
      p_requests: [{ registration_id: registrationId, token_hash: hash }],
    },
  );
  if (error) throw error;
  return {
    token,
    hash,
    rows: (data ?? []) as { registration_id: string; expires_at: string }[],
  };
}

function open(hash: string, client = anon) {
  return client.rpc("get_registration_answer_request", {
    p_token_hash: hash,
    p_ip_address: uniqueIp(),
  });
}

function submit(hash: string, answers: unknown, client = anon) {
  return client.rpc("submit_registration_answers_by_token", {
    p_token_hash: hash,
    p_answers: answers,
    p_ip_address: uniqueIp(),
  });
}

async function answersOf(registrationId: string) {
  const { data, error } = await service
    .from("event_registration_answers")
    .select("question_id, answer_text")
    .eq("registration_id", registrationId);
  if (error) throw error;
  return data ?? [];
}

describe("asking", () => {
  test("writes one link per registration, expiring a day after a start with no end", async () => {
    const startsAt = new Date(Date.now() + 3 * DAY);
    const event = await eventWithQuestions({
      startsAt: startsAt.toISOString(),
    });
    const reg = await registration(event.eventId);

    const { rows } = await ask(event.eventId, reg.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].registration_id).toBe(reg.id);
    expect(Date.parse(rows[0].expires_at)).toBe(startsAt.getTime() + DAY);
  });

  test("expires at the event's end where it has one", async () => {
    const endsAt = new Date(Date.now() + 5 * DAY);
    const event = await eventWithQuestions({ endsAt: endsAt.toISOString() });
    const reg = await registration(event.eventId);

    const { rows } = await ask(event.eventId, reg.id);

    expect(Date.parse(rows[0].expires_at)).toBe(endsAt.getTime());
  });

  test("skips a cancelled registration and one from another event", async () => {
    const event = await eventWithQuestions();
    const other = await eventWithQuestions();
    const cancelled = await registration(event.eventId);
    const elsewhere = await registration(other.eventId);
    await service
      .from("event_registrations")
      .update({
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "other",
      })
      .eq("id", cancelled.id);

    const { data, error } = await adminClient.rpc(
      "request_registration_answers",
      {
        p_event_id: event.eventId,
        p_requests: [
          {
            registration_id: cancelled.id,
            token_hash: mintConfirmationToken().hash,
          },
          {
            registration_id: elsewhere.id,
            token_hash: mintConfirmationToken().hash,
          },
        ],
      },
    );

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("refuses an event that has already ended", async () => {
    const event = await eventWithQuestions({
      startsAt: new Date(Date.now() - 3 * DAY).toISOString(),
    });
    const reg = await registration(event.eventId);

    const { error } = await adminClient.rpc("request_registration_answers", {
      p_event_id: event.eventId,
      p_requests: [
        { registration_id: reg.id, token_hash: mintConfirmationToken().hash },
      ],
    });

    expect(error?.message).toBe("EVENT_ENDED");
  });

  test("refuses anything that is not a hash", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);

    const { error } = await adminClient.rpc("request_registration_answers", {
      p_event_id: event.eventId,
      p_requests: [{ registration_id: reg.id, token_hash: "not-a-hash" }],
    });

    expect(error?.message).toBe("ANSWER_REQUESTS_INVALID");
  });

  test("needs events: manage, and is closed to anon", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    const requests = [
      { registration_id: reg.id, token_hash: mintConfirmationToken().hash },
    ];
    const noAccess = await signIn(SEEDED_USERS.noAccess);

    const asNoAccess = await noAccess.rpc("request_registration_answers", {
      p_event_id: event.eventId,
      p_requests: requests,
    });
    const asAnon = await anon.rpc("request_registration_answers", {
      p_event_id: event.eventId,
      p_requests: requests,
    });

    expect(asNoAccess.error).not.toBeNull();
    expect(asAnon.error).not.toBeNull();
  });
});

describe("who can read a request", () => {
  test("staff read the status but never the hash; anon reads nothing", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    await ask(event.eventId, reg.id);

    const status = await adminClient
      .from("event_registration_answer_requests")
      .select("registration_id, requested_at, answered_at")
      .eq("registration_id", reg.id);
    expect(status.error).toBeNull();
    expect(status.data).toHaveLength(1);

    const hash = await adminClient
      .from("event_registration_answer_requests")
      .select("token_hash")
      .eq("registration_id", reg.id);
    expect(hash.error).not.toBeNull();

    const asAnon = await anon
      .from("event_registration_answer_requests")
      .select("registration_id")
      .eq("registration_id", reg.id);
    expect(asAnon.data ?? []).toEqual([]);
  });

  test("anon cannot read or write answers without a link", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);

    const read = await anon
      .from("event_registration_answers")
      .select("id")
      .eq("registration_id", reg.id);
    expect(read.data ?? []).toEqual([]);

    const write = await anon.rpc("set_registration_answers", {
      p_registration_id: reg.id,
      p_answers: { [event.leavingFrom]: "Somewhere" },
    });
    expect(write.error).not.toBeNull();
    expect(await answersOf(reg.id)).toEqual([]);
  });
});

describe("following a link", () => {
  test("shows the event, a first name and the questions, and nothing else", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId, "Robin Q Example");
    const { hash } = await ask(event.eventId, reg.id);

    const { data, error } = await open(hash);

    expect(error).toBeNull();
    const page = data as LinkPage;
    expect(page.event_id).toBe(event.eventId);
    expect(page.event_name).toBe(event.name);
    expect(page.first_name).toBe("Robin");
    expect(page.questions.map((q) => q.question_id)).toEqual([
      event.gettingThere,
      event.leavingFrom,
    ]);
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(reg.email);
    expect(serialized).not.toContain("Example");
    expect(serialized).not.toContain("party");
  });

  test("saves under the registration rules, and can be used again to correct", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    const { hash } = await ask(event.eventId, reg.id);

    const missing = await submit(hash, { [event.leavingFrom]: "Denver" });
    expect(missing.error?.message).toBe("EVENT_ANSWERS_REQUIRED");

    const first = await submit(hash, {
      [event.gettingThere]: event.ride,
      [event.leavingFrom]: "Denver",
    });
    expect(first.error).toBeNull();
    expect(
      (await answersOf(reg.id)).map((row) => row.answer_text).sort(),
    ).toEqual(["Denver", "Need a ride"]);

    const { data: status } = await adminClient
      .from("event_registration_answer_requests")
      .select("answered_at")
      .eq("registration_id", reg.id)
      .single();
    expect(status?.answered_at).not.toBeNull();

    const correction = await submit(hash, {
      [event.gettingThere]: event.drive,
    });
    expect(correction.error).toBeNull();
    expect((await answersOf(reg.id)).map((row) => row.answer_text)).toEqual([
      "Driving",
    ]);

    // The page shows what was saved.
    const { data } = await open(hash);
    const saved = (data as LinkPage).questions.find(
      (q) => q.question_id === event.gettingThere,
    );
    expect(saved?.value).toBe(event.drive);
  });
});

describe("a dead link", () => {
  async function expectDead(hash: string, client = anon) {
    const read = await open(hash, client);
    expect(read.error?.message).toBe("LINK_INVALID");
    const write = await submit(hash, {}, client);
    expect(write.error?.message).toBe("LINK_INVALID");
  }

  test("made up, or not shaped like a hash", async () => {
    await expectDead(mintConfirmationToken().hash);
    await expectDead("abc");
  });

  test("expired", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    const { hash } = await ask(event.eventId, reg.id);
    await service
      .from("event_registration_answer_requests")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("registration_id", reg.id);

    await expectDead(hash);
  });

  test("superseded by a newer request", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    const older = await ask(event.eventId, reg.id);
    const newer = await ask(event.eventId, reg.id);

    await expectDead(older.hash);
    expect((await open(newer.hash)).error).toBeNull();
  });

  test("its registration cancelled", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    const { hash } = await ask(event.eventId, reg.id);
    await service
      .from("event_registrations")
      .update({
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "not_attending",
      })
      .eq("id", reg.id);

    await expectDead(hash);
  });

  test("followed on a site that resolves no tenant, or another one", async () => {
    const event = await eventWithQuestions();
    const reg = await registration(event.eventId);
    const { hash } = await ask(event.eventId, reg.id);

    await expectDead(hash, anonClient({ slug: `no-such-tenant-${run}` }));
    // Still live on its own site: the refusal above was the tenant's.
    expect((await open(hash)).error).toBeNull();
  });
});
