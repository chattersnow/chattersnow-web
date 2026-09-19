"use server";

import {
  autoReplyDefinition,
  mergeAutoReplySlots,
} from "@/lib/notifications/auto-replies";
import {
  hasRemoteImages,
  renderAutoReplyPreview,
} from "@/lib/notifications/auto-reply-preview";
import { resolveAutoReplyCaller } from "./mail-context";

/**
 * What the preview pane draws: the email, and the headers it would go out
 * with (#1236).
 *
 * `to` is a stand-in address rather than anybody's, because the recipient of a
 * real automatic reply is whoever filled the public form in. Where a *test*
 * would go is `testSendTo`, resolved from the caller's own record -- the two
 * are separate on purpose, so the pane can say both without implying that the
 * reply is addressed to the administrator reading it.
 */
export type AutoReplyPreview = {
  subject: string;
  html: string;
  text: string;
  /** The composed From header, tenant display name and all. */
  from: string;
  /** Null when neither the tenant nor the platform has set one. */
  replyTo: string | null;
  to: string;
  /** Null when the caller's record carries no address at all. */
  testSendTo: string | null;
  /**
   * Whether an images-off toggle would change anything -- which since the
   * branded shell (#1238) means "has this tenant set a logo?". A tenant that
   * has not set one has nothing for a client to block, and the pane hides the
   * control rather than offering one that does nothing.
   */
  hasImages: boolean;
};

export type AutoReplyPreviewResult =
  { error: string } | { preview: AutoReplyPreview };

/** The address the sample reply is shown as going to. RFC 2606 reserves it. */
const SAMPLE_RECIPIENT = "someone@example.org";

/**
 * Render one automatic reply against sample values and the draft in the editor.
 *
 * `slots` is the sparse override object the editor holds -- only what the
 * tenant has rewritten -- so an unsaved edit is what comes back, which is the
 * point of the pane. It is folded over the platform's defaults here with the
 * same `mergeAutoReplySlots()` the resolver uses on a real send, so a slot
 * left alone previews as the wording that would actually go out.
 *
 * Deliberately not validated. A slot holding `{{first_nmae}}` renders empty
 * here exactly as it would in a real send, and seeing that is worth more than
 * a refusal the Save button will give anyway.
 */
export async function renderAutoReplyPreviewAction(
  kind: string,
  slots: Record<string, string>,
): Promise<AutoReplyPreviewResult> {
  const resolved = await resolveAutoReplyCaller();
  if ("error" in resolved) return resolved;
  const { caller } = resolved;

  const definition = autoReplyDefinition(kind);
  if (!definition) return { error: "That automatic reply does not exist." };

  const rendered = renderAutoReplyPreview(
    kind,
    mergeAutoReplySlots(definition, slots),
    {
      orgName: caller.mail.displayName,
      siteUrl: caller.mail.origin,
      timeZone: caller.timeZone,
      branding: caller.mail.branding,
    },
  );
  if (!rendered) {
    return { error: "This reply has no sample to preview against yet." };
  }

  return {
    preview: {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from: caller.mail.identity.from,
      replyTo: caller.mail.identity.replyTo ?? null,
      to: SAMPLE_RECIPIENT,
      testSendTo: caller.toEmail,
      hasImages: hasRemoteImages(rendered.html),
    },
  };
}
