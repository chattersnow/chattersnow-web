// Integration test: exercises the real submitVolunteerApplicationAction
// against a real local Supabase stack (submit_volunteer_application RPC,
// honeypot, per-email dedup, per-IP rate limiting). anon has no direct
// access to volunteer_applications, so the RPC is the only observable
// enforcement point -- a mocked client can't catch a regression in any of
// these checks. Requires `bun run db:start && bun run db:reset` first; run
// via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  deleteVolunteerApplications,
  findVolunteerApplications,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { submitVolunteerApplicationAction } =
  await import("./volunteer-application-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// Every email a test submits, cleaned up afterwards (along with the `people`
// row the RPC resolves behind each application). Deleting by email is a
// no-op for the cases that expect no row.
const submittedEmails: string[] = [];
function applicantEmail(tag: string) {
  const email = uniqueEmail(tag);
  submittedEmails.push(email);
  return email;
}

afterEach(async () => {
  while (submittedEmails.length) {
    await deleteVolunteerApplications(submittedEmails.pop()!);
  }
});

describe("submitVolunteerApplicationAction (integration)", () => {
  test("stores pronouns on the application and on the person record", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("pronouns");

    const result = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email, pronouns: "  they/them  " }),
    );
    expect(result).toMatchObject({ success: true });

    const [application] = await findVolunteerApplications(email);
    expect(application.pronouns).toBe("they/them");

    const { data: person } = await adminClient
      .from("people")
      .select("pronouns")
      .eq("id", application.person_id as string)
      .single();
    expect(person?.pronouns).toBe("they/them");
  });

  test("stores an application and returns its reference code", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("happy-path");

    const result = await submitVolunteerApplicationAction(
      formData({
        name: "Jamie Rivera",
        email,
        phone: "555-0100",
        roleInterest: "Ride Buddy",
        availability: "Weekends",
      }),
    );

    // The code is what the applicant later types into the status lookup, so
    // it has to be the one actually persisted, not a throwaway.
    expect(result).toMatchObject({ success: true });
    const referenceCode = (result as { referenceCode: string }).referenceCode;
    expect(referenceCode).toMatch(/^[A-Z2-9]{8}$/);

    const applications = await findVolunteerApplications(email);
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      name: "Jamie Rivera",
      phone: "555-0100",
      role_interest: "Ride Buddy",
      availability: "Weekends",
      reference_code: referenceCode,
      status: "new",
    });
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("honeypot");

    const result = await submitVolunteerApplicationAction(
      formData({
        name: "A Bot",
        email,
        company: "Definitely A Company",
      }),
    );

    // The RPC hands back a freshly generated (but unstored) code so probing
    // bots learn nothing was rejected -- only a DB check catches this.
    expect(result).toMatchObject({ success: true });
    expect(await findVolunteerApplications(email)).toHaveLength(0);
  });

  test("rejects a second application from the same email within a day", async () => {
    currentIp = uniqueIp();
    const email = applicantEmail("already-submitted");

    const first = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email }),
    );
    expect(first).toMatchObject({ success: true });

    // Case-insensitive on purpose: the RPC's dedup lowercases both sides, so
    // a re-submission with different casing must not slip a duplicate in.
    const second = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email: email.toUpperCase() }),
    );

    expect(second).toEqual({
      error:
        "We already have a recent application from this email — we'll be in touch soon.",
    });
    expect(await findVolunteerApplications(email)).toHaveLength(1);
  });

  test("rejects an email the RPC considers invalid but the parser let through", async () => {
    currentIp = uniqueIp();

    // The form parser only requires an "@"; the RPC additionally requires a
    // dot-suffixed domain. This asserts the RPC's stricter check is the
    // authoritative one and that its error code reaches the user.
    const result = await submitVolunteerApplicationAction(
      formData({ name: "Jamie Rivera", email: "jamie@example" }),
    );

    expect(result).toEqual({ error: "A valid email is required." });
    expect(await findVolunteerApplications("jamie@example")).toHaveLength(0);
  });

  test("rate-limits repeated submissions from the same IP", async () => {
    currentIp = uniqueIp();
    // A fresh email each time, so it's the per-IP window (5 per 15 minutes)
    // being exercised here and not the per-email dedup.
    for (let i = 0; i < 5; i++) {
      const result = await submitVolunteerApplicationAction(
        formData({
          name: "Repeat Applicant",
          email: applicantEmail(`rate-${i}`),
        }),
      );
      expect(result).toMatchObject({ success: true });
    }

    const blockedEmail = applicantEmail("rate-5");
    const limited = await submitVolunteerApplicationAction(
      formData({ name: "Repeat Applicant", email: blockedEmail }),
    );

    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
    expect(await findVolunteerApplications(blockedEmail)).toHaveLength(0);
  });
});
