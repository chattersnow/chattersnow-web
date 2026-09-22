// Changing your mind about being photographed (#599), against a real local
// stack.
//
// **A consent that cannot be withdrawn is not consent**, which is the whole
// reason `set_my_photo_consent()` exists and the reason nothing like it exists
// for the participant waiver: an acceptance records an act that happened and
// stands, and a permission is either still given or is not.
//
// What is under test is the part a policy cannot express: whose row a signed-in
// constituent may write, what happens when the organization stops asking, and
// that the text is re-snapshotted rather than carried over. There is no RLS
// path for any of it -- `event_registrations`' only update policy requires
// events:manage and its grant is table-level -- so these two definer functions
// are the entire surface.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPublishedEvent,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  uniqueEmail,
} from "../../../../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const SCOPE = [
  "We use photos and video from our events in our own newsletters, on this site, and on our social media accounts.",
  "We never sell them, and we will take one down if you ask.",
];

let tenantId: string;
let eventId: string;
let eventCleanup: () => Promise<void>;
let restoreModule: () => Promise<void>;

const createdUsers: string[] = [];
const createdPeople: string[] = [];

/**
 * A signed-in constituent with an approved claim, which is what
 * `my_constituent_person_id()` reads: `people.auth_user_id` pointing at the
 * session. Set directly here rather than through the claim flow, which
 * `claims.integration.test.ts` already covers.
 */
async function constituent(): Promise<{
  client: SupabaseClient;
  personId: string;
}> {
  const email = uniqueEmail(`photo-my-${run}`);
  const { data: user, error: userError } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (userError) throw userError;
  createdUsers.push(user.user!.id);

  const { data: person, error: personError } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      source_type: "other",
      name: `Photo Consenter ${run}`,
      email,
      auth_user_id: user.user!.id,
    })
    .select("id")
    .single();
  if (personError) throw new Error(`person: ${personError.message}`);
  createdPeople.push(person.id as string);

  return { client: await signIn(email), personId: person.id as string };
}

async function registrationFor(personId: string, answer: boolean | null) {
  const resolved =
    answer === null
      ? {
          photo_consent: null,
          photo_consent_at: null,
          photo_consent_text: null,
        }
      : {
          photo_consent: answer,
          photo_consent_at: new Date("2026-08-01T12:00:00Z").toISOString(),
          photo_consent_text: "The scope as it read in August.",
        };

  const { data, error } = await service
    .from("event_registrations")
    .insert({
      tenant_id: tenantId,
      event_id: eventId,
      person_id: personId,
      name: `Photo Consenter ${run}`,
      email: uniqueEmail(`photo-reg-${run}`),
      party_size: 1,
      ...resolved,
    })
    .select("id")
    .single();
  if (error) throw new Error(`registration: ${error.message}`);
  return data.id as string;
}

async function readRow(registrationId: string) {
  const { data, error } = await service
    .from("event_registrations")
    .select("photo_consent, photo_consent_at, photo_consent_text")
    .eq("id", registrationId)
    .single();
  if (error) throw error;
  return data;
}

async function writeScope(paragraphs: string[] = SCOPE) {
  await service.from("site_content").upsert(
    {
      tenant_id: tenantId,
      key: "events.photo_consent",
      value: paragraphs,
      published_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" },
  );
}

async function clearScope() {
  await service
    .from("site_content")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", "events.photo_consent");
}

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");

  const event = await createPublishedEvent({ name: `Photo consent ${run}` });
  eventId = event.id;
  eventCleanup = event.cleanup;
});

afterAll(async () => {
  await clearScope();
  await service
    .from("event_registrations")
    .delete()
    .in("person_id", createdPeople);
  await eventCleanup();
  await service.from("people").delete().in("id", createdPeople);
  for (const userId of createdUsers) {
    await service.auth.admin.deleteUser(userId);
  }
  await restoreModule();
});

describe("set_my_photo_consent", () => {
  test("withdraws a consent, re-stamping the moment and the text", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, true);

    const { error } = await client.rpc("set_my_photo_consent", {
      p_registration_id: registrationId,
      p_consent: false,
    });
    expect(error).toBeNull();

    const row = await readRow(registrationId);
    expect(row.photo_consent).toBe(false);
    // Re-snapshotted, not carried over: they are answering the words as they
    // read today, and those are what this answer was given against.
    expect(row.photo_consent_text).toBe(SCOPE.join("\n\n"));
    expect(new Date(row.photo_consent_at as string).getUTCFullYear()).toBe(
      new Date().getUTCFullYear(),
    );
  });

  test("gives one back, because withdrawal runs both ways", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, false);

    expect(
      (
        await client.rpc("set_my_photo_consent", {
          p_registration_id: registrationId,
          p_consent: true,
        })
      ).error,
    ).toBeNull();

    expect((await readRow(registrationId)).photo_consent).toBe(true);
  });

  // A tenant that has written a scope since somebody registered should be able
  // to collect an answer from a row whose columns are null -- which is what
  // `asked` on the reader is for.
  test("answers a question nobody put at the time", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, null);

    expect(
      (
        await client.rpc("set_my_photo_consent", {
          p_registration_id: registrationId,
          p_consent: true,
        })
      ).error,
    ).toBeNull();

    expect((await readRow(registrationId)).photo_consent).toBe(true);
  });

  // Refused rather than quietly cleared. Nulling the row would destroy the
  // record of a decline, and a decline is the answer an organizer acts on.
  test("refuses where the organization has stopped asking, and leaves the answer alone", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, false);
    await clearScope();

    const { error } = await client.rpc("set_my_photo_consent", {
      p_registration_id: registrationId,
      p_consent: true,
    });
    expect(error?.message).toBe("PHOTO_CONSENT_UNAVAILABLE");

    expect((await readRow(registrationId)).photo_consent).toBe(false);
  });

  // Null is "nobody asked". Writing it back would let somebody erase the
  // record of having been asked, which is the one thing the three states exist
  // to keep straight. Withdrawing is `false`.
  test("will not write the not-asked state back", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, true);

    const { error } = await client.rpc("set_my_photo_consent", {
      p_registration_id: registrationId,
      p_consent: null,
    });
    expect(error?.message).toBe("PHOTO_CONSENT_REQUIRED");
    expect((await readRow(registrationId)).photo_consent).toBe(true);
  });

  test("cannot reach somebody else's registration", async () => {
    await writeScope();
    const owner = await constituent();
    const other = await constituent();
    const registrationId = await registrationFor(owner.personId, true);

    const { error } = await other.client.rpc("set_my_photo_consent", {
      p_registration_id: registrationId,
      p_consent: false,
    });
    expect(error?.message).toBe("REGISTRATION_NOT_FOUND");

    expect((await readRow(registrationId)).photo_consent).toBe(true);
  });
});

describe("my_photo_consent", () => {
  test("reports the answer and that the organization is asking", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, false);

    const { data, error } = await client.rpc("my_photo_consent", {
      p_registration_id: registrationId,
    });
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({ asked: true, consent: false });
  });

  // The distinction the portal and this page both need: whether the
  // organization asks *now* is not whether it asked when they registered.
  test("says the organization is not asking once the scope is empty", async () => {
    await writeScope();
    const { client, personId } = await constituent();
    const registrationId = await registrationFor(personId, true);
    await clearScope();

    const { data } = await client.rpc("my_photo_consent", {
      p_registration_id: registrationId,
    });
    // Still holds the answer; just no longer offers a control for it.
    expect(data?.[0]).toMatchObject({ asked: false, consent: true });
  });

  test("returns no rows for a registration that is not theirs", async () => {
    await writeScope();
    const owner = await constituent();
    const other = await constituent();
    const registrationId = await registrationFor(owner.personId, true);

    const { data, error } = await other.client.rpc("my_photo_consent", {
      p_registration_id: registrationId,
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
