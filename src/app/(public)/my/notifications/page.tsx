import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { CONSTITUENT_NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { MyNotificationPreferences } from "./preferences";
import { MyPageLayout } from "../my-page-layout";

const MY_NOTIFICATIONS_PATH = `${MY_PATH_PREFIX}/notifications`;

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your emails"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/**
 * Which emails you get (#1165).
 *
 * Only the `constituent` kinds. The registry's other entries are staff
 * queues -- "New volunteer applications", "New contact messages" -- and a
 * volunteer shown those would be given switches that can never change what
 * arrives, however they are set. A staffer who wants those still has them on
 * /portal/account, because there is one account and one set of rows behind
 * both screens.
 */
export default async function MyNotificationsPage() {
  const { personId } = await requireConstituentSession(MY_NOTIFICATIONS_PATH);
  if (!personId) redirect(MY_PATH_PREFIX);

  const supabase = await createSupabaseServerClient();

  // Through the RPC, not the table: the select policy resolves the reader
  // through a tenant membership a constituent does not have.
  const { data } = await supabase.rpc("my_notification_preferences");
  const enabledByKind: Record<string, boolean> = {};
  for (const row of (data ?? []) as { kind: string; enabled: boolean }[]) {
    enabledByKind[row.kind] = row.enabled;
  }

  return (
    <MyPageLayout
      current="notifications"
      title="Your emails"
      intro="These are the messages we send you about things you have done. Turn off anything you would rather not receive; we will remember."
    >
      <Card>
        <CardContent>
          <MyNotificationPreferences
            kinds={CONSTITUENT_NOTIFICATION_KINDS}
            enabledByKind={enabledByKind}
          />
        </CardContent>
      </Card>
    </MyPageLayout>
  );
}
