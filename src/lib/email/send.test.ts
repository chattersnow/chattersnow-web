import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// send.ts imports "server-only", which throws outside Next's bundler (it is
// aliased to a no-op only during a Next.js server build) -- stub it so this
// plain `bun test` run can import the real module, the same way
// src/lib/supabase/admin.integration.test.ts does.
mock.module("server-only", () => ({}));
const { sendEmail } = await import("./send");

const MESSAGE = {
  to: "avery@example.test",
  subject: "2 action items need your attention",
  text: "plain",
  html: "<p>rich</p>",
};

const originalFetch = global.fetch;
const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.EMAIL_FROM;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "reminders@chattersnow.org";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = originalFrom;
});

describe("sendEmail without a key", () => {
  test("logs and succeeds without calling the provider", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true, id: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendEmail with a key", () => {
  test("posts the message and returns the provider's id", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(jsonResponse(200, { id: "msg_123" })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      from: "reminders@chattersnow.org",
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  test("succeeds with a null id when the provider answers without one", async () => {
    global.fetch = mock(() =>
      Promise.resolve(jsonResponse(200, {})),
    ) as unknown as typeof fetch;

    expect(await sendEmail(MESSAGE)).toEqual({ ok: true, id: null });
  });

  test("fails with the provider's own message on a rejection", async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        jsonResponse(422, { message: "The domain is not verified." }),
      ),
    ) as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: "Email provider returned 422: The domain is not verified.",
    });
  });

  test("fails, rather than throwing, when the request never lands", async () => {
    global.fetch = mock(() =>
      Promise.reject(new Error("socket hang up")),
    ) as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    // The digest run must survive one bad send: an exception here would leave
    // every later recipient's ledger row stranded at 'pending'.
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: "Could not reach the email provider: socket hang up",
    });
  });

  test("refuses to send with no from address configured", async () => {
    delete process.env.EMAIL_FROM;
    const fetchMock = mock(() => Promise.resolve(jsonResponse(200, {})));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({
      ok: false,
      error: "EMAIL_FROM is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
