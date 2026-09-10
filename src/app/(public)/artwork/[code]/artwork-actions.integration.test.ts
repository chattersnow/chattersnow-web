// Integration test: exercises the real artwork intake against a local Supabase
// stack (#870). anon has no grant on any of the three tables and no policy on
// the bucket, so the rate limit, the honeypot, the open-call check and the
// image-path pattern are only observable through this path -- a mocked client
// cannot catch a regression that lives in SQL.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../../test/integration-setup";

const service = serviceRoleClient();

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

mock.module("@/lib/request-origin", () => ({
  getRequestOrigin: async () => "http://localhost:3000",
}));

// The action schedules its notification send with after(). This file imports
// the action directly, so there is no request scope and Next's real after()
// would throw -- and the notifier it schedules imports "server-only", which
// throws outside Next's bundler.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
const afterTasks: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

const { createArtworkUploadSlotsAction, submitArtworkAction } =
  await import("./artwork-actions");

type Call = {
  id: string;
  code: string;
  eventId: string;
  tenantId: string;
  cleanup: () => Promise<void>;
};

const createdCalls: Call[] = [];

async function createCall(
  overrides: {
    is_open?: boolean;
    max_images?: number;
    closes_at?: string;
    rights_note?: string;
  } = {},
): Promise<Call> {
  const event = await createPublishedEvent({ visibility: "public" });
  const { data, error } = await service
    .from("event_artwork_calls")
    .insert({ event_id: event.id, is_open: true, ...overrides })
    .select("id, submission_code, tenant_id")
    .single();
  if (error) throw error;

  const call: Call = {
    id: data.id as string,
    code: data.submission_code as string,
    eventId: event.id,
    tenantId: data.tenant_id as string,
    // The call cascades to its submissions and their image rows; the event
    // fixture owns the event itself.
    cleanup: async () => {
      await service.from("event_artwork_calls").delete().eq("id", data.id);
      await event.cleanup();
    },
  };
  createdCalls.push(call);
  return call;
}

function imagePaths(call: Call, draft = crypto.randomUUID()) {
  const image = crypto.randomUUID();
  return {
    path: `${call.tenantId}/${call.eventId}/${draft}/${image}.jpg`,
    thumbPath: `${call.tenantId}/${call.eventId}/${draft}/${image}-thumb.jpg`,
    contentType: "image/jpeg",
    byteSize: 4096,
  };
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  // Consent is required since #877; ticked by default so each test below still
  // exercises the thing it is named for. The rule has its own tests.
  fd.set("consent", "on");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function submissionsFor(callId: string) {
  const { data, error } = await service
    .from("artwork_submissions")
    .select(
      "id, submitter_name, submitter_email, title, status, credit_name, portfolio_url, consented_at",
    )
    .eq("call_id", callId);
  if (error) throw error;
  return data;
}

afterEach(async () => {
  // Settle the scheduled sends before deleting their rows, so a notify still
  // in flight cannot race the cleanup it is reading through.
  await Promise.all(afterTasks.splice(0));
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", "artwork_submission");
  while (createdCalls.length) {
    await createdCalls.pop()!.cleanup();
  }
});

describe("submitArtworkAction (integration)", () => {
  test("stores a submission and its images from an anonymous visitor", async () => {
    currentIp = uniqueIp();
    const call = await createCall();
    const email = uniqueEmail("artwork");
    const image = imagePaths(call);

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari Nakamura",
        email,
        title: "Snowline",
        medium: "Ink on paper",
        statement: "Made on the lift.",
        images: JSON.stringify([image]),
      }),
    );

    expect(result).toEqual({ success: true });

    const rows = await submissionsFor(call.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      submitter_name: "Ari Nakamura",
      submitter_email: email,
      title: "Snowline",
      status: "pending",
    });

    const { data: images } = await service
      .from("artwork_submission_images")
      .select("storage_path, thumb_path, position")
      .eq("submission_id", rows[0].id);
    expect(images).toHaveLength(1);
    expect(images![0]).toMatchObject({
      storage_path: image.path,
      thumb_path: image.thumbPath,
      position: 0,
    });
  });

  test("records consent, the credit name and the portfolio link", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari Nakamura",
        email: uniqueEmail("artwork-credit"),
        creditName: "snowghost",
        portfolio: "@snowghost",
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    expect(result).toEqual({ success: true });
    const rows = await submissionsFor(call.id);
    expect(rows[0]).toMatchObject({
      submitter_name: "Ari Nakamura",
      credit_name: "snowghost",
      portfolio_url: "@snowghost",
    });
    expect(rows[0].consented_at).not.toBeNull();
  });

  // Null means "credit me as submitter_name", so an artist who retypes their
  // own name must not leave a row that looks like a deliberate pseudonym.
  test("stores no credit name when it matches the contact name", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    await submitArtworkAction(
      call.code,
      formData({
        name: "Ari Nakamura",
        email: uniqueEmail("artwork-samename"),
        creditName: "  Ari Nakamura  ",
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    const rows = await submissionsFor(call.id);
    expect(rows[0].credit_name).toBeNull();
  });

  test("refuses a submission that did not consent, and writes nothing", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const withoutConsent = formData({
      name: "Ari",
      email: uniqueEmail("artwork-noconsent"),
      images: JSON.stringify([imagePaths(call)]),
    });
    withoutConsent.delete("consent");

    const result = await submitArtworkAction(call.code, withoutConsent);

    expect(result).toEqual({
      error:
        "Please confirm the work is yours and that you agree to the terms above.",
    });
    expect(await submissionsFor(call.id)).toHaveLength(0);
  });

  test("refuses a portfolio link carrying a scheme that is not http(s)", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-badlink"),
        portfolio: "javascript://example.test/x",
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    expect(result).toEqual({
      error: "A portfolio link has to start with http:// or https://.",
    });
    expect(await submissionsFor(call.id)).toHaveLength(0);
  });

  test("accepts a lowercase code, since the link may be retyped", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const result = await submitArtworkAction(
      call.code.toLowerCase(),
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-case"),
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    expect(result).toEqual({ success: true });
    expect(await submissionsFor(call.id)).toHaveLength(1);
  });

  test("answers a filled honeypot like a success and writes nothing", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Bot",
        email: uniqueEmail("artwork-bot"),
        company: "Acme Spam Co",
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    expect(result).toEqual({ success: true });
    expect(await submissionsFor(call.id)).toHaveLength(0);
  });

  test("refuses a closed call", async () => {
    currentIp = uniqueIp();
    const call = await createCall({ is_open: false });

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-closed"),
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    expect(result).toEqual({ error: "This call for artwork is closed." });
    expect(await submissionsFor(call.id)).toHaveLength(0);
  });

  test("refuses a call whose window has already closed", async () => {
    currentIp = uniqueIp();
    const call = await createCall({
      closes_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-expired"),
        images: JSON.stringify([imagePaths(call)]),
      }),
    );

    expect(result).toEqual({ error: "This call for artwork is closed." });
  });

  test("refuses more images than the call accepts", async () => {
    currentIp = uniqueIp();
    const call = await createCall({ max_images: 1 });

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-too-many"),
        images: JSON.stringify([imagePaths(call), imagePaths(call)]),
      }),
    );

    expect(result).toEqual({
      error: "That is more images than this call accepts.",
    });
    // The insert and the image loop share a transaction, so the refusal must
    // take the submission row with it.
    expect(await submissionsFor(call.id)).toHaveLength(0);
  });

  test("refuses a path outside this tenant and event, and rolls the row back", async () => {
    currentIp = uniqueIp();
    const call = await createCall();
    const stranger = crypto.randomUUID();
    const draft = crypto.randomUUID();

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-path"),
        images: JSON.stringify([
          {
            // Another tenant's prefix entirely.
            path: `${stranger}/${call.eventId}/${draft}/${crypto.randomUUID()}.jpg`,
            thumbPath: `${stranger}/${call.eventId}/${draft}/${crypto.randomUUID()}-thumb.jpg`,
            contentType: "image/jpeg",
            byteSize: 1,
          },
        ]),
      }),
    );

    expect(result).toEqual({
      error:
        "Something went wrong with your images. Please remove them and add them again.",
    });
    expect(await submissionsFor(call.id)).toHaveLength(0);
  });

  test("refuses a traversal-shaped path", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const result = await submitArtworkAction(
      call.code,
      formData({
        name: "Ari",
        email: uniqueEmail("artwork-traversal"),
        images: JSON.stringify([
          {
            path: `${call.tenantId}/${call.eventId}/../../../secrets/key.jpg`,
            thumbPath: `${call.tenantId}/${call.eventId}/../../../secrets/key-thumb.jpg`,
            contentType: "image/jpeg",
            byteSize: 1,
          },
        ]),
      }),
    );

    expect(result).toEqual({
      error:
        "Something went wrong with your images. Please remove them and add them again.",
    });
  });

  test("rate limits after five submissions from one address", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ok = await submitArtworkAction(
        call.code,
        formData({
          name: `Artist ${attempt}`,
          email: uniqueEmail(`artwork-rl-${attempt}`),
          images: JSON.stringify([imagePaths(call)]),
        }),
      );
      expect(ok).toEqual({ success: true });
    }

    const blocked = await submitArtworkAction(
      call.code,
      formData({
        name: "One too many",
        email: uniqueEmail("artwork-rl-blocked"),
        images: JSON.stringify([imagePaths(call)]),
      }),
    );
    expect(blocked).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
    expect(await submissionsFor(call.id)).toHaveLength(5);
  });
});

describe("createArtworkUploadSlotsAction (integration)", () => {
  test("mints a signed pair per image, under this tenant and event", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    const result = await createArtworkUploadSlotsAction(call.code, [
      "image/jpeg",
      "image/png",
    ]);

    expect("slots" in result).toBe(true);
    if (!("slots" in result)) return;
    expect(result.slots).toHaveLength(2);
    for (const slot of result.slots) {
      expect(slot.path.startsWith(`${call.tenantId}/${call.eventId}/`)).toBe(
        true,
      );
      expect(slot.thumbPath.endsWith("-thumb.jpg")).toBe(true);
      expect(slot.token.length).toBeGreaterThan(0);
      expect(slot.thumbToken.length).toBeGreaterThan(0);
    }
    // The extension follows the declared type, because the path is minted
    // before the file is read and submit_artwork checks the pair together.
    expect(result.slots[0].path.endsWith(".jpg")).toBe(true);
    expect(result.slots[1].path.endsWith(".png")).toBe(true);
  });

  test("mints nothing for a closed call", async () => {
    currentIp = uniqueIp();
    const call = await createCall({ is_open: false });

    expect(
      await createArtworkUploadSlotsAction(call.code, ["image/jpeg"]),
    ).toEqual({ error: "This call for artwork is closed." });
  });

  test("mints nothing for a type the bucket would refuse", async () => {
    currentIp = uniqueIp();
    const call = await createCall();

    expect(
      await createArtworkUploadSlotsAction(call.code, ["image/gif"]),
    ).toEqual({ error: "Images must be JPEG, PNG or WebP." });
  });

  test("refuses to mint more slots than the call accepts", async () => {
    currentIp = uniqueIp();
    const call = await createCall({ max_images: 1 });

    expect(
      await createArtworkUploadSlotsAction(call.code, [
        "image/jpeg",
        "image/jpeg",
      ]),
    ).toEqual({ error: "That is more images than this call accepts." });
  });
});

describe("anonymous reach (integration)", () => {
  test("anon cannot read the tables behind the form", async () => {
    const call = await createCall();
    const anon = anonClient();

    for (const table of [
      "event_artwork_calls",
      "artwork_submissions",
      "artwork_submission_images",
    ]) {
      const { data } = await anon.from(table).select("id");
      // Either a refusal or an empty set: what matters is that the code, which
      // is public, never leads to a row.
      expect(data ?? []).toHaveLength(0);
    }
    expect(call.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
  });

  test("anon cannot write to the artwork bucket without a signed URL", async () => {
    const call = await createCall();
    const anon = anonClient();

    const { error } = await anon.storage
      .from("artwork-submissions")
      .upload(
        `${call.tenantId}/${call.eventId}/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`,
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      );

    expect(error).not.toBeNull();
  });

  test("get_artwork_call returns nothing for an unknown code", async () => {
    const anon = anonClient();
    const { data } = await anon.rpc("get_artwork_call", {
      p_code: "ZZZZZZZZZZZZ",
      p_ip_address: uniqueIp(),
    });
    expect(data ?? []).toHaveLength(0);
  });

  // The three columns #876 added. The page renders a deadline, a rights line
  // and every instant on it from these, so a migration that drops one of them
  // has to fail here rather than as a blank row in production.
  test("get_artwork_call carries the deadline, the rights note and the event's zone", async () => {
    const closesAt = new Date(Date.now() + 86_400_000).toISOString();
    const call = await createCall({
      closes_at: closesAt,
      rights_note: "You keep the original. We print it once and credit you.",
    });
    const anon = anonClient();

    const { data } = await anon
      .rpc("get_artwork_call", {
        p_code: call.code,
        p_ip_address: uniqueIp(),
      })
      .maybeSingle();

    expect(data).toMatchObject({
      call_id: call.id,
      event_id: call.eventId,
      // createPublishedEvent's default, and the whole point of returning it:
      // the page must not format a deadline in the server's zone.
      event_timezone: "America/Chicago",
      rights_note: "You keep the original. We print it once and credit you.",
    });
    expect(
      new Date((data as { closes_at: string }).closes_at).toISOString(),
    ).toBe(closesAt);
  });
});
