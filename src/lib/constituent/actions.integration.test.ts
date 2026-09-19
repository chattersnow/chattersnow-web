// Acting from /my (#1165), against a real local stack.
//
// Three actions, and the thing worth proving about each is the same: the
// caller never says who they are. The person comes from `auth.uid()` and the
// request host, so an argument cannot steer a registration, a timesheet or an
// opt-out onto somebody else's record -- and none of the three can produce a
// duplicate `people` row, which is the whole reason the signed-in paths exist
// alongside the anonymous ones.
//
// What is being proven, in order:
//
//   1. Registering attaches to the caller's existing record. No match, no
//      mint, no second `people` row, and no second registration.
//   2. Self-logged hours are provisional. They land in
//      `volunteer_hour_submissions`, never in `volunteer_hours`; only a
//      volunteers:manage holder moves them, and the ledger row that results
//      names the volunteer as the one who logged it.
//   3. An opt-out is a row, not a deletion, and it is the same row
//      /portal/account writes.
//   4. Every one of the three is rate-limited per (route, ip), and every one
//      of them closes when the tenant turns the constituent area off.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  serviceRoleClient,
  signIn,
  signInAs,
  tenantToday,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

type Constituent = {
  client: SupabaseClient;
  userId: string;
  personId: string;
  email: string;
};

let tenantId: string;
let alice: Constituent;
let bob: Constituent;

const cleanups: (() => Promise<void>)[] = [];

async function makeConstituent(tag: string): Promise<Constituent> {
  const email = uniqueEmail(`${tag}-${run}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;

  const { data: person, error: personError } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      name: `${tag} Constituent ${run}`,
      source_type: "other",
      email,
      auth_user_id: userId,
    })
    .select("id")
    .single();
  if (personError) throw new Error(`person: ${personError.message}`);

  // Order matters, and so does the audit trail. `auth.users` has no ON DELETE
  // anywhere, so the account cannot go until every row that names it as an
  // author has -- which for this file means the submissions' own audit rows as
  // well as the submissions. A leaked account here is what makes
  // test/seed-shape.integration.test.ts's absolute counts drift.
  cleanups.push(async () => {
    const { data: submissions } = await service
      .from("volunteer_hour_submissions")
      .select("id")
      .eq("person_id", person.id);
    for (const submission of submissions ?? []) {
      await service.from("audit_log").delete().eq("record_id", submission.id);
    }
    await service.from("audit_log").delete().eq("record_id", person.id);
    await service.from("audit_log").delete().eq("actor_id", userId);
    await service
      .from("volunteer_hour_submissions")
      .delete()
      .eq("person_id", person.id);
    await service.from("volunteer_hours").delete().eq("person_id", person.id);
    await service
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", person.id);
    await service
      .from("event_registrations")
      .delete()
      .eq("person_id", person.id);
    await service.from("people").delete().eq("id", person.id);
    const { error: userError } = await service.auth.admin.deleteUser(userId);
    if (userError)
      throw new Error(`leaked account ${userId}: ${userError.message}`);
  });

  return { client: await signIn(email), userId, personId: person.id, email };
}

async function setModule(key: string, enabled: boolean) {
  const { error } = await service
    .from("tenant_modules")
    .upsert(
      { tenant_id: tenantId, module_key: key, enabled },
      { onConflict: "tenant_id,module_key" },
    );
  if (error) throw new Error(`module ${key}: ${error.message}`);
}

async function countPeople(): Promise<number> {
  const { count, error } = await service
    .from("people")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

beforeAll(async () => {
  const { data } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "example-nonprofit")
    .single();
  tenantId = data!.id;

  await setModule("constituent_accounts", true);

  alice = await makeConstituent("alice");
  bob = await makeConstituent("bob");
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await service
    .from("tenant_modules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("module_key", "constituent_accounts");
});

describe("registering as yourself", () => {
  test("attaches to the record you already have, and creates no second one", async () => {
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    const before = await countPeople();
    const { data: registrationId, error } = await alice.client.rpc(
      "register_myself_for_event",
      {
        p_event_id: event.id,
        p_party_size: 2,
        p_notes: "Bringing a friend",
        p_phone: "555-0143",
        p_ip_address: uniqueIp(),
      },
    );
    expect(error).toBeNull();
    expect(await countPeople()).toBe(before);

    const { data: registration } = await service
      .from("event_registrations")
      .select("person_id, email, party_size, notes, phone, name")
      .eq("id", registrationId as string)
      .single();

    expect(registration!.person_id).toBe(alice.personId);
    // Off the record, not off the form: there is no name or email argument.
    expect(registration!.email).toBe(alice.email);
    expect(registration!.name).toContain("alice");
    expect(registration!.party_size).toBe(2);
    // The correction travels on the registration and stops there.
    expect(registration!.phone).toBe("555-0143");
    const { data: person } = await service
      .from("people")
      .select("phone")
      .eq("id", alice.personId)
      .single();
    expect(person!.phone).toBeNull();
  });

  test("shows you your own registration and nobody else's", async () => {
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    await alice.client.rpc("register_myself_for_event", {
      p_event_id: event.id,
      p_party_size: 1,
      p_ip_address: uniqueIp(),
    });

    const mine = await alice.client.rpc("my_event_registration", {
      p_event_id: event.id,
    });
    expect(mine.data).toHaveLength(1);

    const theirs = await bob.client.rpc("my_event_registration", {
      p_event_id: event.id,
    });
    expect(theirs.data).toHaveLength(0);
  });

  // #1259. Asked of this reader too, and stored exactly as they answered it.
  // The check-in ledger only knows the events this tenant ran on this
  // platform, so their own answer is still the only source for anything
  // earlier -- and it is stored as a separate fact from the ledger, never
  // derived from it.
  test("carries the self-reported been-before answer, and null when skipped", async () => {
    const answered = await createPublishedEvent();
    cleanups.push(answered.cleanup);
    const skipped = await createPublishedEvent();
    cleanups.push(skipped.cleanup);

    const first = await alice.client.rpc("register_myself_for_event", {
      p_event_id: answered.id,
      p_party_size: 1,
      p_attended_before: true,
      p_ip_address: uniqueIp(),
    });
    expect(first.error).toBeNull();

    const second = await alice.client.rpc("register_myself_for_event", {
      p_event_id: skipped.id,
      p_party_size: 1,
      p_ip_address: uniqueIp(),
    });
    expect(second.error).toBeNull();

    const { data: rows } = await service
      .from("event_registrations")
      .select("id, attended_before")
      .in("id", [first.data as string, second.data as string]);

    const byId = new Map(
      (rows ?? []).map((row) => [row.id as string, row.attended_before]),
    );
    expect(byId.get(first.data as string)).toBe(true);
    // Unanswered, not "no" -- and not filled in from the history the caller is
    // entitled to see on `/my`.
    expect(byId.get(second.data as string)).toBe(null);
  });

  test("will not register you twice", async () => {
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    const first = await alice.client.rpc("register_myself_for_event", {
      p_event_id: event.id,
      p_party_size: 1,
      p_ip_address: uniqueIp(),
    });
    expect(first.error).toBeNull();

    const second = await alice.client.rpc("register_myself_for_event", {
      p_event_id: event.id,
      p_party_size: 1,
      p_ip_address: uniqueIp(),
    });
    expect(second.error?.message).toBe("ALREADY_REGISTERED");
  });

  test("re-checks the event the way the anonymous path does", async () => {
    const draft = await createPublishedEvent({ status: "draft" });
    cleanups.push(draft.cleanup);
    const closed = await createPublishedEvent({ registration_enabled: false });
    cleanups.push(closed.cleanup);
    const full = await createPublishedEvent({ capacity: 1 });
    cleanups.push(full.cleanup);

    expect(
      (
        await alice.client.rpc("register_myself_for_event", {
          p_event_id: draft.id,
          p_party_size: 1,
          p_ip_address: uniqueIp(),
        })
      ).error?.message,
    ).toBe("EVENT_NOT_FOUND");

    expect(
      (
        await alice.client.rpc("register_myself_for_event", {
          p_event_id: closed.id,
          p_party_size: 1,
          p_ip_address: uniqueIp(),
        })
      ).error?.message,
    ).toBe("REGISTRATION_CLOSED");

    expect(
      (
        await alice.client.rpc("register_myself_for_event", {
          p_event_id: full.id,
          p_party_size: 2,
          p_ip_address: uniqueIp(),
        })
      ).error?.message,
    ).toBe("EVENT_AT_CAPACITY");
  });

  test("is rate limited per (route, ip)", async () => {
    const ip = uniqueIp();
    let limited = false;

    for (let attempt = 0; attempt < 12 && !limited; attempt += 1) {
      const event = await createPublishedEvent();
      cleanups.push(event.cleanup);
      const { error } = await alice.client.rpc("register_myself_for_event", {
        p_event_id: event.id,
        p_party_size: 1,
        p_ip_address: ip,
      });
      limited = error?.message === "RATE_LIMITED";
    }

    expect(limited).toBe(true);
  });
});

describe("logging your own hours", () => {
  test("lands as pending, and not in the ledger", async () => {
    const { data: submissionId, error } = await alice.client.rpc(
      "log_my_volunteer_hours",
      {
        p_hours: 4.5,
        p_logged_date: tenantToday(),
        p_notes: "Lift line all morning",
        p_ip_address: uniqueIp(),
      },
    );
    expect(error).toBeNull();

    const { data: submission } = await service
      .from("volunteer_hour_submissions")
      .select("person_id, status, hours, volunteer_hours_id, created_by")
      .eq("id", submissionId as string)
      .single();

    expect(submission!.person_id).toBe(alice.personId);
    expect(submission!.status).toBe("pending");
    expect(Number(submission!.hours)).toBe(4.5);
    expect(submission!.volunteer_hours_id).toBeNull();
    // The record that the volunteer typed it themselves.
    expect(submission!.created_by).toBe(alice.userId);

    const { count } = await service
      .from("volunteer_hours")
      .select("id", { count: "exact", head: true })
      .eq("person_id", alice.personId);
    expect(count).toBe(0);
  });

  test("appears in the volunteer's own history, apart from confirmed hours", async () => {
    const { data } = await alice.client.rpc("my_volunteer_history");
    const rows = (data ?? []) as { kind: string; status: string | null }[];
    const unconfirmed = rows.filter((row) => row.kind === "hours_unconfirmed");
    expect(unconfirmed.length).toBeGreaterThan(0);
    expect(unconfirmed[0].status).toBe("pending");
  });

  test("the portal reads the queue with its event and role attached", async () => {
    // The query listPendingVolunteerHoursAction() runs, verbatim. Worth a test
    // of its own because the foreign keys here are composite
    // (20260906080000), and PostgREST resolves an embed from the key it finds:
    // a select that parses today can stop resolving when a key is reshaped,
    // and nothing else in this suite would notice.
    const { data, error } = await adminClient
      .from("volunteer_hour_submissions")
      .select(
        "id, hours, logged_date, notes, created_at, person:people(id, name), event:events(id, name), volunteer_role_type:volunteer_role_types(id, name)",
      )
      .eq("person_id", alice.personId)
      .eq("status", "pending");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect((data![0] as unknown as { person: { id: string } }).person.id).toBe(
      alice.personId,
    );
  });

  test("refuses a day that has not happened", async () => {
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { error } = await alice.client.rpc("log_my_volunteer_hours", {
      p_hours: 1,
      p_logged_date: tomorrow,
      p_ip_address: uniqueIp(),
    });
    expect(error?.message).toBe("DATE_IN_FUTURE");
  });

  test("a volunteer cannot write the ledger, or decide their own hours", async () => {
    const direct = await alice.client.from("volunteer_hours").insert({
      tenant_id: tenantId,
      person_id: alice.personId,
      hours: 99,
      logged_date: tenantToday(),
    });
    expect(direct.error).not.toBeNull();

    const { data: pending } = await service
      .from("volunteer_hour_submissions")
      .select("id")
      .eq("person_id", alice.personId)
      .eq("status", "pending")
      .limit(1)
      .single();

    const review = await alice.client.rpc("review_volunteer_hour_submission", {
      p_submission_id: pending!.id,
      p_confirm: true,
    });
    expect(review.error).not.toBeNull();
  });

  test("confirming writes the ledger row, logged by the volunteer", async () => {
    const { data: pending } = await service
      .from("volunteer_hour_submissions")
      .select("id")
      .eq("person_id", alice.personId)
      .eq("status", "pending")
      .limit(1)
      .single();

    const { error } = await adminClient.rpc(
      "review_volunteer_hour_submission",
      { p_submission_id: pending!.id, p_confirm: true, p_hours: 4 },
    );
    expect(error).toBeNull();

    const { data: submission } = await service
      .from("volunteer_hour_submissions")
      .select("status, hours, volunteer_hours_id, reviewed_by, reviewed_at")
      .eq("id", pending!.id)
      .single();
    expect(submission!.status).toBe("confirmed");
    // The reviewer's correction, not what was claimed.
    expect(Number(submission!.hours)).toBe(4);
    expect(submission!.reviewed_at).not.toBeNull();

    const { data: ledger } = await service
      .from("volunteer_hours")
      .select("person_id, hours, logged_by, updated_by")
      .eq("id", submission!.volunteer_hours_id as string)
      .single();
    expect(ledger!.person_id).toBe(alice.personId);
    expect(Number(ledger!.hours)).toBe(4);
    // #1165: the row records that the volunteer entered it.
    expect(ledger!.logged_by).toBe(alice.userId);
    expect(ledger!.updated_by).not.toBe(alice.userId);
  });

  test("a decision is taken once", async () => {
    const { data: submissionId } = await bob.client.rpc(
      "log_my_volunteer_hours",
      { p_hours: 2, p_logged_date: tenantToday(), p_ip_address: uniqueIp() },
    );

    expect(
      (
        await adminClient.rpc("review_volunteer_hour_submission", {
          p_submission_id: submissionId as string,
          p_confirm: false,
          p_note: "We had you down for a different day",
        })
      ).error,
    ).toBeNull();

    const { data: declined } = await service
      .from("volunteer_hour_submissions")
      .select("status, volunteer_hours_id")
      .eq("id", submissionId as string)
      .single();
    expect(declined!.status).toBe("declined");
    // A decline writes no hours.
    expect(declined!.volunteer_hours_id).toBeNull();

    const again = await adminClient.rpc("review_volunteer_hour_submission", {
      p_submission_id: submissionId as string,
      p_confirm: true,
    });
    expect(again.error?.message).toBe("ALREADY_REVIEWED");
  });

  test("is rate limited per (route, ip)", async () => {
    const ip = uniqueIp();
    let limited = false;

    for (let attempt = 0; attempt < 14 && !limited; attempt += 1) {
      const { error } = await bob.client.rpc("log_my_volunteer_hours", {
        p_hours: 1,
        // A different day each time, so the one-pending-per-day index is not
        // what stops it.
        p_logged_date: new Date(Date.now() - (attempt + 2) * 86_400_000)
          .toISOString()
          .slice(0, 10),
        p_ip_address: ip,
      });
      limited = error?.message === "RATE_LIMITED";
    }

    expect(limited).toBe(true);
  });
});

describe("choosing which emails you get", () => {
  test("writes the same row /portal/account writes", async () => {
    const { error } = await alice.client.rpc("set_my_notification_preference", {
      p_kind: "event_registration_confirmation",
      p_enabled: false,
    });
    expect(error).toBeNull();

    const { data } = await service
      .from("person_notification_preferences")
      .select("tenant_id, person_id, enabled")
      .eq("person_id", alice.personId)
      .eq("kind", "event_registration_confirmation")
      .single();
    expect(data!.tenant_id).toBe(tenantId);
    expect(data!.enabled).toBe(false);
  });

  test("turning one back on updates the row rather than making a second", async () => {
    await alice.client.rpc("set_my_notification_preference", {
      p_kind: "event_registration_confirmation",
      p_enabled: true,
    });

    const { data, error } = await service
      .from("person_notification_preferences")
      .select("id, enabled")
      .eq("person_id", alice.personId)
      .eq("kind", "event_registration_confirmation");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].enabled).toBe(true);
  });

  test("reads back only your own", async () => {
    const mine = await alice.client.rpc("my_notification_preferences");
    expect((mine.data ?? []).length).toBeGreaterThan(0);

    const theirs = await bob.client.rpc("my_notification_preferences");
    expect(theirs.data).toHaveLength(0);
  });

  test("a constituent cannot write the table directly", async () => {
    const { error } = await alice.client
      .from("person_notification_preferences")
      .insert({
        tenant_id: tenantId,
        person_id: bob.personId,
        kind: "task_digest",
        enabled: true,
      });
    expect(error).not.toBeNull();
  });
});

describe("the module gate", () => {
  test("every action closes when the tenant turns the area off", async () => {
    await setModule("constituent_accounts", false);
    try {
      const event = await createPublishedEvent();
      cleanups.push(event.cleanup);

      expect(
        (
          await bob.client.rpc("register_myself_for_event", {
            p_event_id: event.id,
            p_party_size: 1,
            p_ip_address: uniqueIp(),
          })
        ).error?.message,
      ).toBe("NO_RECORD");

      expect(
        (
          await bob.client.rpc("log_my_volunteer_hours", {
            p_hours: 1,
            p_logged_date: tenantToday(),
            p_ip_address: uniqueIp(),
          })
        ).error?.message,
      ).toBe("NO_RECORD");

      expect(
        (
          await bob.client.rpc("set_my_notification_preference", {
            p_kind: "event_registration_confirmation",
            p_enabled: false,
          })
        ).error,
      ).not.toBeNull();

      expect(
        (await bob.client.rpc("my_notification_preferences")).data,
      ).toHaveLength(0);
    } finally {
      await setModule("constituent_accounts", true);
    }
  });

  test("a staff account acting as itself is not treated differently", async () => {
    // The first user of all three actions is an administrator registering for
    // their own organization's event (#1165). Their permissions must change
    // nothing about what the write does: the only thing that decides is which
    // `people` row `auth.uid()` resolves to.
    const staff = await signInAs(SEEDED_USERS.admin);
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    const { data: registrationId, error } = await staff.rpc(
      "register_myself_for_event",
      { p_event_id: event.id, p_party_size: 1, p_ip_address: uniqueIp() },
    );
    expect(error).toBeNull();

    const { data: registration } = await service
      .from("event_registrations")
      .select("person_id, people:people(auth_user_id)")
      .eq("id", registrationId as string)
      .single();
    expect(registration!.person_id).not.toBeNull();
  });
});
