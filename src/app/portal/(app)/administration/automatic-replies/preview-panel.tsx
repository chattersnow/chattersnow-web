"use client";

import { useEffect, useState, useTransition } from "react";
import { ImageOff, MailWarning, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runAction } from "@/components/portal/action-toast";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { withRemoteImagesBlocked } from "@/lib/notifications/auto-reply-preview";
import {
  renderAutoReplyPreviewAction,
  type AutoReplyPreview,
} from "./preview-actions";
import { sendAutoReplyTestAction } from "./test-send-actions";

/**
 * What one automatic reply looks like, beside the fields it is written in
 * (#1236).
 *
 * Two halves of the same loop. The pane answers "what does it say?" as you
 * type, and the button answers "what does it look like where it lands?" --
 * which only a real mail client can say, because it is the thing that decides
 * whether the images load and the widths hold.
 *
 * The HTML goes into a sandboxed iframe rather than through
 * `dangerouslySetInnerHTML`, and both reasons are load-bearing: an email
 * carries its own fonts, widths and colours and would otherwise inherit the
 * portal's stylesheet and preview as something no inbox will ever show; and
 * the copy inside it was typed by a tenant administrator, so it must not be
 * able to reach the portal's DOM even if the escaping in
 * `auto-reply-email.ts` is ever wrong. `sandbox=""` is the empty allow-list --
 * no scripts, no forms, no same-origin.
 *
 * The plain-text part sits beside it rather than below, because it is what a
 * text-only client and a good many spam filters actually read, and it is
 * where an escaping bug shows up as literal `&amp;`.
 */

/** How long typing has to stop before the pane re-renders. */
const DEBOUNCE_MS = 400;

type PreviewPart = "html" | "text";

function isPreviewPart(value: string): value is PreviewPart {
  return value === "html" || value === "text";
}

/**
 * The email in a document of its own.
 *
 * A bare fragment in `srcDoc` inherits the iframe's default white background
 * and 8px body margin, which is close enough to an inbox to mislead; this
 * pins the margin and the background so what is measured on screen is the
 * email's own spacing.
 */
function previewDocument(html: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html { background: #f5f5f4; } body { margin: 0; padding: 24px; background: #ffffff; }</style>
</head>
<body>
${html}
</body>
</html>`;
}

export function AutoReplyPreviewPanel({
  kind,
  label,
  slots,
  enabled,
  emailEnabled,
}: {
  kind: string;
  label: string;
  /** The editor's sparse overrides. Only the slots this tenant has rewritten. */
  slots: Record<string, string>;
  /** This one reply's switch. */
  enabled: boolean;
  /** The org-wide kill switch, which outranks it. */
  emailEnabled: boolean;
}) {
  const [part, setPart] = useUrlTabState<PreviewPart>({
    param: "part",
    fallback: "html",
    isValid: isPreviewPart,
  });
  const [preview, setPreview] = useState<AutoReplyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagesBlocked, setImagesBlocked] = useState(false);
  const [isSending, startSending] = useTransition();

  // Serialized rather than passed as an object, so the effect re-runs when the
  // wording changes and not on every keystroke's new object identity.
  const draft = JSON.stringify(slots);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const result = await renderAutoReplyPreviewAction(
        kind,
        JSON.parse(draft) as Record<string, string>,
      );
      // A reply switched while this was in flight must not paint the previous
      // one's email under the new one's heading.
      if (!current) return;
      if ("error" in result) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setError(null);
      setPreview(result.preview);
    }, DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, draft]);

  function sendTest() {
    startSending(async () => {
      await runAction(() => sendAutoReplyTestAction(kind, slots), {
        success: (result) =>
          result.logged
            ? `Logged rather than sent: this deployment has no mail provider configured.`
            : `Test sent to ${result.sentTo}.`,
        description: (result) =>
          result.logged
            ? `It would have gone to ${result.sentTo}.`
            : "Give it a minute, then check your inbox and your spam folder.",
        onError: setError,
      });
    });
  }

  return (
    <Card className="2xl:sticky 2xl:top-4">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Preview</h3>
          {/* The switch carries its own name, which says what the state means
              rather than repeating the two words beside it -- so the text is
              decoration and the control is what a screen reader reads. */}
          {preview?.hasImages && (
            <div className="app-muted flex items-center gap-2 text-xs">
              <ImageOff className="size-3.5" aria-hidden />
              <span aria-hidden>Images off</span>
              <Switch
                checked={imagesBlocked}
                onCheckedChange={setImagesBlocked}
                aria-label="Show the email with remote images blocked, the way most inboxes open it"
              />
            </div>
          )}
        </div>

        {/* Said in the pane rather than instead of it: a switched-off reply is
            exactly the one somebody is about to rewrite and turn back on, so
            it still renders. */}
        {!emailEnabled ? (
          <Alert>
            <MailWarning />
            <AlertDescription>
              Outbound email is off for this organization, so this is what would
              be sent rather than what is being sent.
            </AlertDescription>
          </Alert>
        ) : !enabled ? (
          <Alert>
            <MailWarning />
            <AlertDescription>
              This reply is switched off, so nobody is being sent one. The
              preview shows what it would say.
            </AlertDescription>
          </Alert>
        ) : null}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {preview ? (
          <>
            <HeaderSummary preview={preview} />

            <Tabs
              value={part}
              onValueChange={(value) => setPart(value as PreviewPart)}
            >
              <TabsList variant="line" aria-label="Which part of the email">
                <TabsTrigger value="html">Formatted</TabsTrigger>
                <TabsTrigger value="text">Plain text</TabsTrigger>
              </TabsList>

              <TabsContent value="html">
                <iframe
                  // Remounted when the email changes, so a client that has
                  // already painted does not keep a stale document.
                  key={`${kind}-${imagesBlocked}`}
                  title={`${label}, as it would be received`}
                  sandbox=""
                  srcDoc={previewDocument(
                    imagesBlocked
                      ? withRemoteImagesBlocked(preview.html)
                      : preview.html,
                  )}
                  className="h-[28rem] w-full rounded-lg border border-[var(--line)] bg-white"
                />
              </TabsContent>

              <TabsContent value="text">
                <pre className="h-[28rem] overflow-auto rounded-lg border border-[var(--line)] p-4 text-xs leading-relaxed whitespace-pre-wrap">
                  {preview.text}
                </pre>
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="app-muted text-xs">
                {preview.testSendTo
                  ? `A test goes to ${preview.testSendTo} and nobody else.`
                  : "Your account has no email address, so there is nowhere to send a test."}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSending || !preview.testSendTo}
                onClick={sendTest}
              >
                {isSending ? <Spinner /> : <Send />}
                Send myself a test
              </Button>
            </div>
          </>
        ) : (
          !error && (
            <div
              className="app-muted flex h-[28rem] items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-sm"
              aria-live="polite"
            >
              <Spinner className="mr-2 size-4" /> Rendering the email...
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

/**
 * From, Reply-To and a sample To.
 *
 * The row an administrator most needs is Reply-To: replies to these emails go
 * wherever `notifications.reply_to` or `EMAIL_REPLY_TO` points, which is very
 * often not them, and nothing else in the portal ever says so.
 */
function HeaderSummary({ preview }: { preview: AutoReplyPreview }) {
  const rows: [string, string][] = [
    ["From", preview.from || "Not configured yet"],
    ["Reply-To", preview.replyTo ?? "No reply address set"],
    ["To", preview.to],
    ["Subject", preview.subject],
  ];

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-[var(--line)] p-3 text-xs">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="app-muted">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
