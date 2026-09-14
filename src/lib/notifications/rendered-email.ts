import type { EmailAttachment } from "@/lib/email/attachment";

/**
 * What a renderer hands the sender: the parts of a message, and nothing about
 * who it is for or how it goes out.
 *
 * Its own file because both sides of that boundary need the type and neither
 * should have to import the other. deliverEmail() is `server-only` (it writes
 * the ledger with the service-role client), while the renderers are plain
 * functions unit-tested under `bun run test` -- so the type cannot live with
 * either without dragging one into the other's world.
 */
export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  /**
   * Files to travel with the message. Optional, so the renderers that predate
   * attachments (#1068) are unchanged; only the event registration
   * confirmation sets it, with its calendar file.
   */
  attachments?: readonly EmailAttachment[];
};
