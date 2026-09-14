/**
 * A file that travels with a message (#1068).
 *
 * Its own module for the same reason src/lib/notifications/rendered-email.ts is
 * one: both sides of the renderer/sender boundary need the type and neither
 * should have to import the other. A renderer is a plain function unit-tested
 * under `bun run test`, while src/lib/email/send.ts is `server-only` -- so the
 * type cannot live with either without dragging one into the other's world.
 *
 * `content` is text rather than bytes because the only attachment this
 * application produces is a calendar file. Base64 is deliberately not done
 * here: encoding is a property of the provider's wire format, so it belongs in
 * send.ts, and a readable `content` is what lets a renderer's test assert on
 * the calendar lines rather than on an opaque blob. A binary attachment would
 * add a `Uint8Array` branch here and in send.ts, and nothing else.
 */
export type EmailAttachment = {
  /** What the recipient's mail client calls the saved file, e.g. "event.ics". */
  filename: string;
  /** The full MIME type, e.g. `text/calendar; charset=utf-8; method=PUBLISH`. */
  contentType: string;
  /** UTF-8 text. */
  content: string;
};
