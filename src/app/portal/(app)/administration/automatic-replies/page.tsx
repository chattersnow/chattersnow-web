import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deviceClass } from "@/lib/portal/device";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { AUTO_REPLIES } from "@/lib/notifications/auto-replies";
import { AutoReplyEditor, type SavedAutoReply } from "./auto-reply-editor";

export const metadata: Metadata = {
  title: "Automatic Replies",
};

/** The slots a registry key actually claims, as strings and nothing else. */
function savedSlots(kind: string, value: unknown): Record<string, string> {
  const definition = AUTO_REPLIES.find((entry) => entry.kind === kind);
  if (!definition || !value || typeof value !== "object") return {};
  const rows = value as Record<string, unknown>;
  return Object.fromEntries(
    definition.slots
      .map((slot) => [slot.key, rows[slot.key]])
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
  );
}

/**
 * Administration → Automatic Replies (#1235, epic #1232).
 *
 * Where a tenant writes the emails its public forms send back. A page of its
 * own rather than a sixth tab on Organization Settings: a tab is another view
 * of one object, and five templates are five objects
 * (`docs/portal-navigation.md`). It is filed under Administration because
 * these span five modules -- events, volunteers, inventory, communications,
 * artwork -- and what governs the organization as a whole is filed here.
 *
 * A tenant with no rows is not a tenant with no replies: every kind falls back
 * to the registry's defaults, which are today's wording verbatim, so the
 * fields below read as prefilled rather than empty (#1233).
 */
export default async function AutomaticRepliesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, emailEnabled, device] = await Promise.all([
    supabase.from("auto_reply_templates").select("kind, enabled, slots"),
    getOrgEmailEnabled(supabase),
    deviceClass(),
  ]);

  const saved: Record<string, SavedAutoReply> = Object.fromEntries(
    (data ?? []).map((row) => [
      row.kind,
      {
        enabled: typeof row.enabled === "boolean" ? row.enabled : true,
        slots: savedSlots(row.kind, row.slots),
      },
    ]),
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Automatic Replies
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        The emails your public forms send straight back to the person who filled
        them in. You write the wording; the portal keeps adding the details —
        the event date and its calendar attachment, the reference code and its
        status link, the list of items requested.
      </p>

      <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed">
        Whether any email goes out at all, and who it comes from, is in{" "}
        <Link
          href="/portal/administration/organization-settings?tab=notifications"
          className="underline underline-offset-4"
        >
          Organization Settings → Notifications
        </Link>
        . Every change here is recorded in the{" "}
        <Link
          href="/portal/administration/audit-log"
          className="underline underline-offset-4"
        >
          audit log
        </Link>
        .
      </p>

      <div className="mt-6">
        {/* Editing on top of a failed read would write a sparse object built
            from nothing, quietly discarding wording this tenant already has.
            Nothing renders until the rows are known. */}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Your automatic replies could not be loaded, so nothing here can be
              edited safely. Reload the page; the emails themselves are
              unaffected.
            </AlertDescription>
          </Alert>
        ) : (
          <AutoReplyEditor
            device={device}
            saved={saved}
            emailEnabled={emailEnabled}
          />
        )}
      </div>
    </>
  );
}
