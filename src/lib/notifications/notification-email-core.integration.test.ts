// Integration coverage for the notification-email core (#1125) against a real
// local Supabase stack: the RPCs, the ledger, and -- the case the whole
// confirmation step exists for -- who the confirmation is addressed to.
//
// The provider is the only thing stubbed here. sendEmail() is replaced so the
// test can read the recipient off the message; everything between the core and
// it is the real path, because the defect being guarded against is precisely
// one of those links handing the send the wrong address (#1049).
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
import {
  SEEDED_USERS,
  createPerson,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
} from "../../../test/integration-setup";
import type { NotificationEmailContext } from "./notification-email-core";

// The core reaches "server-only" through the sender it imports lazily, and
// that module throws outside Next's bundler.
mock.module("server-only", () => ({}));

const sent: { to: string; subject: string }[] = [];
mock.module("@/lib/email/send", () => ({
  sendEmail: async (message: { to: string; subject: string }) => {
    sent.push({ to: message.to, subject: message.subject });
    return { ok: true, id: `test-${sent.length}` };
  },
}));

// Imported after the mocks, not at the top: a static import is hoisted, and
// the sender's `server-only` would throw before mock.module() had run.
const { setMyNotificationEmail, setNotificationEmailForPerson } =
  await import("./notification-email-core");
const { NOTIFICATION_EMAIL_CONFIRMATION_KIND } =
  await import("./notification-email-confirmation");

const service = serviceRoleClient();
const ORIGIN = "https://portal.chattersnow.example";

/** Collects what the core schedules, so the test can run it and look. */
function capturingContext(): NotificationEmailContext & {
  run: () => Promise<void>;
  scheduled: number;
} {
  const tasks: (() => Promise<void>)[] = [];
  return {
    origin: ORIGIN,
    schedule: (task) => tasks.push(task),
    get scheduled() {
      return tasks.length;
    },
    async run() {
      for (const task of tasks) await task();
    },
  };
}

let adminPersonId: string;
const personCleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  const { data, error } = await service
    .from("people")
    .select("id")
    .eq("email", SEEDED_USERS.admin)
    .single();
  if (error) throw error;
  adminPersonId = data.id as string;
});

afterEach(async () => {
  sent.length = 0;
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", NOTIFICATION_EMAIL_CONFIRMATION_KIND);
  // The seeded admin's own row is shared with every other file in the suite,
  // so put it back the way seed.sql left it.
  await service
    .from("people")
    .update({
      notification_email: null,
      notification_email_pending: null,
      notification_email_token: null,
      notification_email_token_expires_at: null,
    })
    .eq("id", adminPersonId);
});

afterAll(async () => {
  for (const cleanup of personCleanups) await cleanup();
});

async function deliveries() {
  const { data, error } = await service
    .from("notification_deliveries")
    .select("person_id, status")
    .eq("kind", NOTIFICATION_EMAIL_CONFIRMATION_KIND);
  if (error) throw error;
  return data ?? [];
}

describe("setNotificationEmailForPerson (integration)", () => {
  test("mails the address being claimed, not the admin who typed it", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const person = await createPerson();
    personCleanups.push(person.cleanup);
    const claimed = uniqueEmail("claimed");
    const context = capturingContext();

    const result = await setNotificationEmailForPerson(
      admin,
      person.id,
      claimed,
      context,
    );

    expect(result).toEqual({
      success: true,
      outcome: "pending",
      pendingEmail: claimed,
    });
    expect(context.scheduled).toBe(1);

    // Nothing has left the building until the scheduled task runs: the save
    // must not wait on the provider.
    expect(sent).toEqual([]);
    await context.run();

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(claimed);
    // The regression #1049 exists to prevent. An administrator may ask on
    // somebody's behalf; they may not complete the loop for a mailbox they do
    // not hold, so the link must never reach them.
    expect(sent[0].to).not.toBe(SEEDED_USERS.admin);

    // Claimed in the ledger against the person whose address it is, which is
    // what stops a retried Server Action mailing twice.
    expect(await deliveries()).toEqual([
      { person_id: person.id, status: "sent" },
    ]);
  });

  test("stages the address rather than switching delivery to it", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const person = await createPerson();
    personCleanups.push(person.cleanup);
    const claimed = uniqueEmail("staged");

    await setNotificationEmailForPerson(
      admin,
      person.id,
      claimed,
      capturingContext(),
    );

    const { data } = await service
      .from("people")
      .select("notification_email, notification_email_pending")
      .eq("id", person.id)
      .single();
    expect(data?.notification_email).toBeNull();
    expect(data?.notification_email_pending).toBe(claimed);
  });

  test("refuses a caller without people:manage, and mails nothing", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const person = await createPerson();
    personCleanups.push(person.cleanup);
    const context = capturingContext();

    const result = await setNotificationEmailForPerson(
      volunteer,
      person.id,
      uniqueEmail("refused"),
      context,
    );

    expect(result).toEqual({
      error: {
        code: "forbidden",
        message: "You don't have permission to perform this action.",
      },
    });
    expect(context.scheduled).toBe(0);

    const { data } = await service
      .from("people")
      .select("notification_email_pending")
      .eq("id", person.id)
      .single();
    expect(data?.notification_email_pending).toBeNull();
  });
});

describe("setMyNotificationEmail (integration)", () => {
  test("mails the caller's own claimed address and claims the ledger row", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const claimed = uniqueEmail("mine");
    const context = capturingContext();

    const result = await setMyNotificationEmail(admin, claimed, context);
    await context.run();

    expect(result).toEqual({
      success: true,
      outcome: "pending",
      pendingEmail: claimed,
    });
    expect(sent.map((message) => message.to)).toEqual([claimed]);
    expect(await deliveries()).toEqual([
      { person_id: adminPersonId, status: "sent" },
    ]);
  });

  test("clearing the override sends nothing", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const context = capturingContext();

    const result = await setMyNotificationEmail(admin, "", context);
    await context.run();

    expect(result).toEqual({
      success: true,
      outcome: "cleared",
      pendingEmail: null,
    });
    expect(sent).toEqual([]);
    expect(await deliveries()).toEqual([]);
  });
});
