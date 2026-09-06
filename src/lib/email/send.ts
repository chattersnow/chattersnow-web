import "server-only";

/**
 * The one place this application talks to an email provider (#488).
 *
 * `server-only` for the same reason src/lib/supabase/admin.ts is: it reads a
 * secret, and a stray import from a client component would try to ship it to
 * the browser. The signature is deliberately provider-agnostic -- to, subject,
 * and both body parts -- so the event-triggered sends (#742) and the
 * leadership ops report (#743) reuse it unchanged, and so swapping providers
 * is a change to this file alone.
 *
 * Resend, over plain fetch. Sending is a single POST; the SDK would be a
 * runtime dependency earning one call, and a mocked `global.fetch` is a
 * simpler thing to unit-test against than a mocked client object.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Never throws. A missing key, a network failure and a 4xx all settle into a
 * value, because the caller records the outcome in notification_deliveries and
 * an exception halfway through a digest run would strand rows at 'pending'.
 *
 * `id` is null on the no-op path, which is the only case where `ok: true`
 * does not mean a provider accepted the message.
 */
export type SendEmailResult =
  { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(
  message: EmailMessage,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // No key configured: log and succeed. Development, preview deploys and CI all
  // run without one, and this is what lets the whole path -- the cron route,
  // the digest query, the ledger writes, both control levels -- be exercised
  // end to end without a single real message leaving the building.
  if (!apiKey) {
    console.info(
      `[email] RESEND_API_KEY unset; not sending "${message.subject}" to ${message.to}`,
    );
    return { ok: true, id: null };
  }

  if (!from) {
    return { ok: false, error: "EMAIL_FROM is not configured." };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
  } catch (cause) {
    return {
      ok: false,
      error: `Could not reach the email provider: ${errorText(cause)}`,
    };
  }

  if (!response.ok) {
    // Resend answers a rejection with a JSON body carrying `message`; read it
    // when it's there, since "422" on its own tells an administrator reading
    // the ledger nothing about which address was refused.
    const detail = await readErrorDetail(response);
    return {
      ok: false,
      error: `Email provider returned ${response.status}${detail ? `: ${detail}` : ""}`,
    };
  }

  const body = (await response.json().catch(() => null)) as {
    id?: unknown;
  } | null;
  return { ok: true, id: typeof body?.id === "string" ? body.id : null };
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body?.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
