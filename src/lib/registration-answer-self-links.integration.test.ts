// Integration test for the registrant's own answers link (#1591), against the
// real RPCs on a local Supabase stack: the link issued with a registration,
// superseding, the already-registered resend and its rate limit, and the
// "answers changed" stamp. That a link works only on its own tenant's site is
// the same lookup #1502's links use, asserted in the isolation suite.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, describe, expect, test } from "bun:test";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);
const cleanups: (() => Promise<void>)[] = [];

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function event({ questions = true } = {}) {
  const fixture = await createPublishedEvent({ name: `Self links ${run}` });
  cleanups.push(fixture.cleanup);
  const ids = {
    gettingThere: crypto.randomUUID(),
    ride: crypto.randomUUID(),
    drive: crypto.randomUUID(),
  };
  if (questions) {
    const { error } = await adminClient.rpc(
      "save_event_registration_questions",
      {
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
        ],
      },
    );
    if (error) throw error;
  }
  return { eventId: fixture.id, ...ids };
}

async function registration(eventId: string, email = uniqueEmail("self")) {
  const { data, error } = await service
    .from("event_registrations")
    .insert({ event_id: eventId, name: "Robin Example", email, party_size: 1 })
    .select("id, tenant_id")
    .single();
  if (error) throw error;
  return { id: data.id as string, tenantId: data.tenant_id as string, email };
}

async function issue(registrationId: string) {
  const { hash } = mintConfirmationToken();
  const { data, error } = await service.rpc("issue_registration_answer_link", {
    p_registration_id: registrationId,
    p_token_hash: hash,
    p_source: "confirmation",
  });
  if (error) throw error;
  return { hash, expiresAt: data as string | null };
}

function open(hash: string) {
  return anon.rpc("get_registration_answer_request", {
    p_token_hash: hash,
    p_ip_address: uniqueIp(),
  });
}

function submit(hash: string, answers: unknown) {
  return anon.rpc("submit_registration_answers_by_token", {
    p_token_hash: hash,
    p_answers: answers,
    p_ip_address: uniqueIp(),
  });
}

async function changedAt(registrationId: string) {
  const { data, error } = await service
    .from("event_registrations")
    .select("answers_changed_at")
    .eq("id", registrationId)
    .single();
  if (error) throw error;
  return data.answers_changed_at as string | null;
}

describe("the link issued with a registration", () => {
  test("opens and saves its own registration only, and stamps the change", async () => {
    const e = await event();
    const mine = await registration(e.eventId);
    const other = await registration(e.eventId);
    const { hash, expiresAt } = await issue(mine.id);
    expect(expiresAt).not.toBeNull();

    const page = await open(hash);
    expect(page.error).toBeNull();
    expect((page.data as { event_id: string }).event_id).toBe(e.eventId);

    expect(await changedAt(mine.id)).toBeNull();
    expect(
      (await submit(hash, { [e.gettingThere]: e.drive })).error,
    ).toBeNull();

    const { data: answers } = await service
      .from("event_registration_answers")
      .select("registration_id, answer_text")
      .in("registration_id", [mine.id, other.id]);
    expect(answers).toEqual([
      { registration_id: mine.id, answer_text: "Driving" },
    ]);
    expect(await changedAt(mine.id)).not.toBeNull();
    expect(await changedAt(other.id)).toBeNull();

    // A self-issued link is not a staff ask.
    const { data: request } = await service
      .from("event_registration_answer_requests")
      .select("source, requested_by")
      .eq("registration_id", mine.id)
      .single();
    expect(request).toEqual({ source: "confirmation", requested_by: null });
  });

  test("a newer link supersedes it, whoever issued either", async () => {
    const e = await event();
    const reg = await registration(e.eventId);
    const first = await issue(reg.id);
    const second = await issue(reg.id);

    expect((await open(first.hash)).error?.message).toBe("LINK_INVALID");
    expect((await open(second.hash)).error).toBeNull();

    // A staff ask supersedes the confirmation's link too, and reads as an ask.
    const staff = mintConfirmationToken();
    const asked = await adminClient.rpc("request_registration_answers", {
      p_event_id: e.eventId,
      p_requests: [{ registration_id: reg.id, token_hash: staff.hash }],
    });
    expect(asked.error).toBeNull();
    expect((await open(second.hash)).error?.message).toBe("LINK_INVALID");
    const { data: request } = await service
      .from("event_registration_answer_requests")
      .select("source")
      .eq("registration_id", reg.id)
      .single();
    expect(request?.source).toBe("staff");
  });

  test("is not issued for an event with no questions, a cancelled registration or a made-up id", async () => {
    const plain = await event({ questions: false });
    expect(
      (await issue((await registration(plain.eventId)).id)).expiresAt,
    ).toBeNull();

    const e = await event();
    const cancelled = await registration(e.eventId);
    const { error: cancelError } = await service
      .from("event_registrations")
      .update({
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "not_attending",
      })
      .eq("id", cancelled.id);
    if (cancelError) throw cancelError;
    expect((await issue(cancelled.id)).expiresAt).toBeNull();

    expect((await issue(crypto.randomUUID())).expiresAt).toBeNull();
  });

  test("cannot be issued by anyone but the server", async () => {
    const e = await event();
    const reg = await registration(e.eventId);
    const args = {
      p_registration_id: reg.id,
      p_token_hash: mintConfirmationToken().hash,
      p_source: "confirmation",
    };
    expect(
      (await anon.rpc("issue_registration_answer_link", args)).error,
    ).not.toBeNull();
    expect(
      (await adminClient.rpc("issue_registration_answer_link", args)).error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("issue_registration_answer_link_for_email", {
          p_tenant_id: reg.tenantId,
          p_event_id: e.eventId,
          p_email: reg.email,
          p_token_hash: mintConfirmationToken().hash,
          p_ip_address: uniqueIp(),
        })
      ).error,
    ).not.toBeNull();
  });
});

describe("already registered", () => {
  function resend(
    tenantId: string,
    eventId: string,
    email: string,
    ip = uniqueIp(),
  ) {
    return service.rpc("issue_registration_answer_link_for_email", {
      p_tenant_id: tenantId,
      p_event_id: eventId,
      p_email: email,
      p_token_hash: mintConfirmationToken().hash,
      p_ip_address: ip,
    });
  }

  test("issues the registration a link and returns its own address", async () => {
    const e = await event();
    const reg = await registration(e.eventId);
    const { data, error } = await resend(
      reg.tenantId,
      e.eventId,
      `  ${reg.email.toUpperCase()} `,
    );
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].registration_id).toBe(reg.id);
    expect(data![0].email).toBe(reg.email);

    const { data: request } = await service
      .from("event_registration_answer_requests")
      .select("source")
      .eq("registration_id", reg.id)
      .single();
    expect(request?.source).toBe("already_registered");
  });

  test("issues nothing for an address not registered, or on another event", async () => {
    const e = await event();
    const reg = await registration(e.eventId);
    const elsewhere = await event();
    expect(
      (await resend(reg.tenantId, e.eventId, uniqueEmail("nobody"))).data,
    ).toEqual([]);
    expect(
      (await resend(reg.tenantId, elsewhere.eventId, reg.email)).data,
    ).toEqual([]);
  });

  test("is rate-limited per IP", async () => {
    const e = await event();
    const reg = await registration(e.eventId);
    const ip = uniqueIp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await resend(reg.tenantId, e.eventId, reg.email, ip)).error,
      ).toBeNull();
    }
    expect(
      (await resend(reg.tenantId, e.eventId, reg.email, ip)).error?.message,
    ).toBe("RATE_LIMITED");
  });
});
